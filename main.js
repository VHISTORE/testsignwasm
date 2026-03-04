const worker = new Worker('worker.js');
const GOFILE_TOKEN = "1CXC2VQ263Z4TctNDGiWkE935MnTki35";
const ROOT_FOLDER_ID = "f6473757-cc2b-42b4-bb4e-99d4b8d3429c";

let detectedBundleId = "";
let detectedVersion = "1.0";
let detectedAppName = "App";

async function createAndGetDirectLink(contentId, retryCount = 0) {
    try {
        const response = await fetch(`https://api.gofile.io/contents/${contentId}/directlinks`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GOFILE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expireTime: 4102444800 })
        });
        const result = await response.json();
        if (result.status === "ok" && result.data) {
            const data = result.data;
            if (data.link) return data.link;
            const deepSearch = (obj) => {
                for (let key in obj) {
                    if (typeof obj[key] === 'string' && obj[key].startsWith('http')) return obj[key];
                    if (typeof obj[key] === 'object' && obj[key] !== null) {
                        const found = deepSearch(obj[key]);
                        if (found) return found;
                    }
                }
                return null;
            };
            const foundUrl = deepSearch(data);
            if (foundUrl) return foundUrl;
        }
        if (retryCount < 5) {
            await new Promise(r => setTimeout(r, 3000));
            return await createAndGetDirectLink(contentId, retryCount + 1);
        }
        return null;
    } catch (e) { return null; }
}

function uploadBlobToGoFile(blob, filename, statusEl) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('folderId', ROOT_FOLDER_ID);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://upload.gofile.io/uploadfile');
        xhr.setRequestHeader('Authorization', `Bearer ${GOFILE_TOKEN}`);
        xhr.upload.onprogress = (e) => {
            const percent = Math.round((e.loaded / e.total) * 100);
            statusEl.innerText = `Uploading: ${percent}%`;
        };
        xhr.onload = async function() {
            try {
                const res = JSON.parse(xhr.responseText);
                if (res.status === "ok") {
                    statusEl.innerText = `Getting direct link...`;
                    await new Promise(r => setTimeout(r, 2000));
                    const directUrl = await createAndGetDirectLink(res.data.id);
                    resolve(directUrl);
                } else { reject("GoFile Error"); }
            } catch (e) { reject("JSON Error"); }
        };
        xhr.onerror = () => reject("Network Error");
        xhr.send(formData);
    });
}

document.getElementById('sign-btn').addEventListener('click', async () => {
    const ipaFile = document.getElementById('ipa-file').files[0];
    const p12File = document.getElementById('p12-file').files[0];
    const provFile = document.getElementById('prov-file').files[0];
    const password = document.getElementById('p12-password').value;   // может быть пустым!

    const statusEl = document.getElementById('status');

    // ИСПРАВЛЕНО: пароль теперь НЕ обязателен
    if (!ipaFile || !p12File || !provFile) {
        alert("Заполни все обязательные файлы!\n\nПароль от .p12 можно оставить пустым (если сертификат без пароля)");
        return;
    }

    detectedBundleId = "";
    detectedAppName = "";
   
    statusEl.style.color = "#00ccff";
    statusEl.innerText = "Reading files...";

    try {
        const ipaData = await ipaFile.arrayBuffer();
        const p12Data = await p12File.arrayBuffer();
        const provData = await provFile.arrayBuffer();
        window.currentIpaName = ipaFile.name;

        worker.postMessage({
            ipaData: ipaData,
            p12Data: p12Data,
            provData: provData,
            password: password || ""   // если пусто — передаём пустую строку
        }, [ipaData, p12Data, provData]);
    } catch (e) { 
        statusEl.innerText = "Read error"; 
    }
});

worker.onmessage = async function(e) {
    const statusEl = document.getElementById('status');
    const { type, msg, data } = e.data;

    if (type === 'status') {
        statusEl.innerText = msg;
    }
    else if (type === 'stdout') {
        console.log("WASM: " + msg);
        const cleanMsg = msg.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();

        if (cleanMsg.includes("BundleId:")) {
            let rawId = cleanMsg.split("BundleId:")[1];
            if (rawId.includes("->")) rawId = rawId.split("->")[1];
            detectedBundleId = rawId.trim().replace(/[^a-zA-Z0-9.-]/g, '');
            console.log("Found Bundle ID:", detectedBundleId);
        }
        if (cleanMsg.includes("Version:")) {
            detectedVersion = cleanMsg.split("Version:")[1].trim().replace(/[^a-zA-Z0-9.-]/g, '');
        }
        if (cleanMsg.includes("AppName:")) {
            detectedAppName = cleanMsg.split("AppName:")[1].trim().replace(/[^\w\sА-Яа-яЁё.-]/gi, '');
        }
    }
    else if (type === 'error') {
        statusEl.style.color = "red";
        statusEl.innerText = "Error: " + msg;
    }
    else if (type === 'done') {
        try {
            statusEl.style.color = "#00ccff";
            const signedIpaBlob = new Blob([data], { type: 'application/octet-stream' });
            const ipaDirectUrl = await uploadBlobToGoFile(signedIpaBlob, `Signed_${window.currentIpaName}`, statusEl);
            if (!ipaDirectUrl) throw new Error("GoFile Direct Link failed");

            const finalBundleId = detectedBundleId || 'com.ursa.signed';
            const finalAppName = detectedAppName || 'URSA Mod';

            const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>${ipaDirectUrl}</string>
                </dict>
                <dict>
                    <key>kind</key>
                    <string>display-image</string>
                    <key>url</key>
                    <string>https://developer.apple.com/news/images/og/app-store-og-twitter.png</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>${finalBundleId}</string>
                <key>bundle-version</key>
                <string>${detectedVersion}</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>${finalAppName}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;

            const plistBlob = new Blob([plistContent], { type: 'application/x-plist' });
            const plistDirectUrl = await uploadBlobToGoFile(plistBlob, 'install.plist', statusEl);

            statusEl.style.color = "#30d158";
            statusEl.innerText = "Click INSTALL in the system popup!";
           
            window.location.href = `itms-services://?action=download-manifest&url=${plistDirectUrl}`;
        } catch (err) {
            statusEl.style.color = "red";
            statusEl.innerText = "Error: " + err;
        }
    }
};
