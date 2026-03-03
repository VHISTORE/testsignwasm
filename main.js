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
    statusEl.innerText = "1/4 Initializing WASM Engine...";

    try {
        // Инициализируем модуль zsign (исходя из того самого кода, который ты показал на скрине)
        const zsignModule = await createZSignModule();

        statusEl.innerText = "2/4 Reading files into memory...";
        const ipaData = new Uint8Array(await ipaFile.arrayBuffer());
        const p12Data = new Uint8Array(await p12File.arrayBuffer());
        const provData = new Uint8Array(await provFile.arrayBuffer());

        statusEl.innerText = "3/4 Loading files to Virtual File System...";
        zsignModule.FS.writeFile('app.ipa', ipaData);
        zsignModule.FS.writeFile('cert.p12', p12Data);
        zsignModule.FS.writeFile('prov.mobileprovision', provData);

        statusEl.innerText = "4/4 Signing in progress (don't close tab)...";
        // Параметры для команды подписи
        const args = ['-k', 'cert.p12', '-p', password, '-m', 'prov.mobileprovision', '-o', 'signed.ipa', 'app.ipa'];
        
        // Запуск!
        zsignModule.callMain(args);

        statusEl.innerText = "Preparing download...";
        const signedIpaData = zsignModule.FS.readFile('signed.ipa');

        // Скачиваем готовый файл
        const blob = new Blob([signedIpaData.buffer], { type: 'application/octet-stream' });
        const downloadUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `URSA_${ipaFile.name}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        statusEl.style.color = "#30d158";
        statusEl.innerText = "Success! Signed IPA downloaded.";

    } catch (error) {
        console.error("Signing failed:", error);
        statusEl.style.color = "red";
        statusEl.innerText = "Error during signing! Check console (F12) for details.";
    }
});
