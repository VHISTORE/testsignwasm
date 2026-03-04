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

document.getElementById('sign-btn').addEventListener('click', async () => {
    const ipaFile = document.getElementById('ipa-file').files[0];
    const p12File = document.getElementById('p12-file').files[0];
    const provFile = document.getElementById('prov-file').files[0];
    const password = document.getElementById('p12-password').value;

    const statusEl = document.getElementById('status');

    if (!ipaFile || !p12File || !provFile) {
        alert("Заполни все обязательные файлы!\n\nПароль от .p12 можно оставить пустым");
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
            password: password || ""
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
            statusEl.style.color = "#30d158";
            statusEl.innerText = "Подпись завершена! Сохраняем файл на ПК...";
            
            const signedIpaBlob = new Blob([data], { type: 'application/octet-stream' });
            const localUrl = URL.createObjectURL(signedIpaBlob);
            
            const a = document.createElement('a');
            a.href = localUrl;
            a.download = `Signed_${window.currentIpaName}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setTimeout(() => URL.revokeObjectURL(localUrl), 10000);
        } catch (err) {
            statusEl.style.color = "red";
            statusEl.innerText = "Error: " + err;
        }
    }
};
