async function signIpa(ipaFile, p12File, provFile, password, bundleId) {
    const SERVER_URL = 'https://executive-laid-symbols-prairie.trycloudflare.com/sign';
    
    // Создаем FormData — это единственный способ передать бинарные файлы на сервер
    const formData = new FormData();
    formData.append('ipa', ipaFile);
    formData.append('p12', p12File);
    formData.append('prov', provFile);
    formData.append('password', password);
    formData.append('bundleId', bundleId);

    updateStatus('Uploading and signing... Please wait.');

    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${errorText}`);
        }

        // Получаем подписанный файл как Blob
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        // Создаем скрытую ссылку для скачивания
        const a = document.createElement('a');
        a.href = url;
        a.download = `Signed_${ipaFile.name}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        updateStatus('Success! File downloaded.');
    } catch (err) {
        console.error(err);
        updateStatus(`Error: ${err.message}`);
    }
}
