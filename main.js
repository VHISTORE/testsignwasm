const worker = new Worker('worker.js');

// Твои конфиги из админки
const GOFILE_TOKEN = "1CXC2VQ263Z4TctNDGiWkE935MnTki35"; 
const ROOT_FOLDER_ID = "f6473757-cc2b-42b4-bb4e-99d4b8d3429c"; 

// Твоя функция генерации прямой ссылки
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

// Адаптированная загрузка Blob-файла (WASM выдает нам Blob, а не File)
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
            statusEl.innerText = `Uploading ${filename}: ${percent}%`;
        };

        xhr.onload = async function() {
            try {
                const res = JSON.parse(xhr.responseText);
                if (res.status === "ok") {
                    statusEl.innerText = `Fetching Direct Link for ${filename}...`;
                    await new Promise(r => setTimeout(r, 2000));
                    const directUrl = await createAndGetDirectLink(res.data.id);
                    resolve(directUrl || res.data.downloadPage);
                } else {
                    reject("Upload Error from GoFile");
                }
            } catch (e) { reject("JSON Parse Error"); }
        };
        xhr.onerror = () => reject("Network Error");
        xhr.send(formData);
    });
}

// Запуск подписи
document.getElementById('sign-btn').addEventListener('click', async () => {
    const ipaFile = document.getElementById('ipa-file').files[0];
    const p12File = document.getElementById('p12-file').files[0];
    const provFile = document.getElementById('prov-file').files[0];
    const password = document.getElementById('p12-password').value;
    const statusEl = document.getElementById('status');

    if (!ipaFile || !p12File || !provFile || !password) {
        statusEl.innerText = "Error: Please provide all files and password!";
        statusEl.style.color = "red";
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
        statusEl.innerText = "Error reading files.";
        statusEl.style.color = "red";
    }
});

// Слушаем воркер и грузим на GoFile
worker.onmessage = async function(e) {
    const statusEl = document.getElementById('status');
    const { type, msg, data } = e.data;

    if (type === 'status') {
        statusEl.innerText = msg;
    } 
    else if (type === 'error') {
        statusEl.style.color = "red";
        statusEl.innerText = "Error: " + msg;
    } 
    else if (type === 'done') {
        try {
            statusEl.style.color = "#00ccff";
            
            // 1. Грузим подписанный IPA
            const signedIpaBlob = new Blob([data], { type: 'application/octet-stream' });
            const ipaDirectUrl = await uploadBlobToGoFile(signedIpaBlob, `URSA_Signed_${window.currentIpaName}`, statusEl);

            if (!ipaDirectUrl || !ipaDirectUrl.endsWith('.ipa')) {
                throw new Error("GoFile did not return a valid direct .ipa link.");
            }

            statusEl.innerText = "Generating Plist...";

            // 2. Генерируем Plist с нашей новой ссылкой
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
                <string>com.ursa.signed</string>
                <key>bundle-version</key>
                <string>1.0</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>URSA Mod</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;

            // 3. Грузим Plist на GoFile
            const plistBlob = new Blob([plistContent], { type: 'application/x-plist' });
            const plistDirectUrl = await uploadBlobToGoFile(plistBlob, 'install.plist', statusEl);

            // 4. УСТАНАВЛИВАЕМ
            statusEl.style.color = "#30d158";
            statusEl.innerText = "Success! Look for the install popup.";
            window.location.href = `itms-services://?action=download-manifest&url=${plistDirectUrl}`;

        } catch (err) {
            console.error(err);
            statusEl.style.color = "red";
            statusEl.innerText = "Upload failed: " + err;
        }
    }
};
