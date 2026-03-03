// Запускаем фоновый процесс
const worker = new Worker('worker.js');

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
    statusEl.innerText = "Reading files... (UI remains responsive!)";

    try {
        // Читаем файлы
        const ipaData = await ipaFile.arrayBuffer();
        const p12Data = await p12File.arrayBuffer();
        const provData = await provFile.arrayBuffer();

        // Сохраняем имя файла для итогового скачивания
        window.currentIpaName = ipaFile.name;

        // Отправляем сырые данные в фоновый Worker
        worker.postMessage({
            ipaData: ipaData,
            p12Data: p12Data,
            provData: provData,
            password: password
        }, [ipaData, p12Data, provData]); // Transferable objects - передаем права на память, чтобы не дублировать ее

    } catch (error) {
        statusEl.innerText = "Error reading files.";
        statusEl.style.color = "red";
    }
});

// Слушаем ответы от фонового процесса
worker.onmessage = function(e) {
    const statusEl = document.getElementById('status');
    const { type, msg, data } = e.data;

    if (type === 'status') {
        // Обновляем текст статуса
        statusEl.innerText = msg;
    } 
    else if (type === 'error') {
        statusEl.style.color = "red";
        statusEl.innerText = "Error: " + msg + "\n(Check password and cert)";
    } 
    else if (type === 'done') {
        // Получили готовый файл!
        statusEl.style.color = "#30d158";
        statusEl.innerText = "Success! Preparing download...";

        // Создаем файл и качаем
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const downloadUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `URSA_${window.currentIpaName}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        statusEl.innerText = "Downloaded!";
    }
};
