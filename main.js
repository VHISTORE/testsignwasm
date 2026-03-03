document.getElementById('sign-btn').addEventListener('click', async () => {
    const ipaFile = document.getElementById('ipa-file').files[0];
    const p12File = document.getElementById('p12-file').files[0];
    const provFile = document.getElementById('prov-file').files[0];
    const password = document.getElementById('p12-password').value;
    const statusEl = document.getElementById('status');

    if (!ipaFile || !p12File || !provFile) {
        alert("Please select all files!");
        return;
    }

    statusEl.innerText = "Reading files...";

    try {
        // 1. Читаем файлы как ArrayBuffer (сырые байты)
        const ipaBuffer = await ipaFile.arrayBuffer();
        const p12Buffer = await p12File.arrayBuffer();
        const provBuffer = await provFile.arrayBuffer();

        statusEl.innerText = "Signing in progress (WASM is working)...";

        // 2. Вызываем функцию из нашего WASM (название зависит от того, как скомпилирован zsign)
        // Представим, что WASM отдает нам готовый массив байт подписанного IPA
        const signedIpaBuffer = await signWithWasm(ipaBuffer, p12Buffer, provBuffer, password);

        statusEl.innerText = "Done! Downloading...";

        // 3. Создаем ссылку на скачивание готового файла
        const blob = new Blob([signedIpaBuffer], { type: 'application/octet-stream' });
        const downloadUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `signed_${ipaFile.name}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        statusEl.innerText = "Successfully signed!";

    } catch (error) {
        console.error("Signing failed:", error);
        statusEl.innerText = "Error: " + error.message;
        statusEl.style.color = "red";
    }
});
