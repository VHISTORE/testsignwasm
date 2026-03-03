const worker = new Worker('worker.js');

// Конфиги GoFile из твоей админки
const GOFILE_TOKEN = "1CXC2VQ263Z4TctNDGiWkE935MnTki35"; 
const ROOT_FOLDER_ID = "f6473757-cc2b-42b4-bb4e-99d4b8d3429c"; 

// Переменные для хранения данных об аппке (достаем из логов WASM)
let detectedBundleId = "com.ursa.signed";
let detectedAppName = "URSA Mod";

// Функция генерации прямой ссылки GoFile
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

// Загрузка на GoFile
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
            statusEl.innerText = `Uploading to CDN: ${percent}%`;
        };

        xhr.onload = async function() {
            try {
                const res = JSON.parse(xhr.responseText);
                if (res.status === "ok") {
                    statusEl.innerText = `Finalizing link...`;
                    await new Promise(r => setTimeout(r, 2000));
                    const directUrl = await createAndGetDirectLink(res.data.id);
                    resolve(directUrl);
                } else { reject("GoFile Error"); }
            } catch (e) { reject("Parse Error"); }
        };
        xhr.onerror = () => reject("Network Error");
        xhr.send(formData);
    });
}

// Клик по кнопке
document.getElementById('sign-btn').addEventListener('click', async () => {
    const ipaFile = document.getElementById('ipa-file').files[0];
    const p12File = document.getElementById('p12-file').files[0];
    const provFile = document.getElementById('prov-file').files[0];
    const password = document.getElementById('p12-password').value;
    const statusEl = document.getElementById('status');

    if (!ipaFile || !p12File || !provFile || !password) {
        alert("Заполни все поля!");
        return;
    }

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
            password: password
        }, [ipaData, p12Data, provData]);

    } catch (error) {
        statusEl.innerText = "Read error.";
    }
});

// Логика Воркера
worker.onmessage = async function(e) {
    const statusEl = document.getElementById('status');
    const { type, msg, data } = e.data;

    if (type === 'status') {
        statusEl.innerText = msg;
        
        // Авто-детект данных из логов zsign
        if (msg.includes("BundleId:")) {
            detectedBundleId = msg.split("BundleId:")[1].trim();
            console.log("Detected ID:", detectedBundleId);
        }
        if (msg.includes("AppName:")) {
            detectedAppName = msg.split("AppName:")[1].trim();
            console.log("Detected Name:", detectedAppName);
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
            const ipaDirectUrl = await uploadBlobToGoFile(signedIpaBlob, `URSA_${window.currentIpaName}`, statusEl);

            if (!ipaDirectUrl) throw new Error("Could not get Direct Link");

            statusEl.innerText = "Creating manifest...";

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
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>${detectedBundleId}</string>
                <key>bundle-version</key>
                <string>1.0</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>${detectedAppName}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;

            const plistBlob = new Blob([plistContent], { type: 'application/x-plist' });
            const plistDirectUrl = await uploadBlobToGoFile(plistBlob, 'install.plist', statusEl);

            statusEl.style.color = "#30d158";
            statusEl.innerText = "Done! Click Install on popup.";
            
            // Запуск установки
            window.location.href = `itms-services://?action=download-manifest&url=${plistDirectUrl}`;

        } catch (err) {
            statusEl.style.color = "red";
            statusEl.innerText = "Failed: " + err;
        }
    }
};
