const signBtn = document.getElementById('sign-btn');
const statusDiv = document.getElementById('status');

// ТВОЯ ССЫЛКА ИЗ ТЕРМИНАЛА CLOUDFLARE (меняй её, если она обновится)
const SERVER_URL = 'https://scale-tub-lists-filled.trycloudflare.com/sign';

function updateStatus(msg) {
    statusDiv.innerText = msg;
    console.log(msg);
}

signBtn.onclick = async () => {
    const ipaFile = document.getElementById('ipa-file').files[0];
    const p12File = document.getElementById('p12-file').files[0];
    const provFile = document.getElementById('prov-file').files[0];
    const password = document.getElementById('p12-password').value;

    if (!ipaFile || !p12File || !provFile) {
        updateStatus("⚠️ Ошибка: Выбери все 3 файла!");
        return;
    }

    // Блокируем интерфейс
    signBtn.disabled = true;
    signBtn.style.opacity = "0.5";
    updateStatus("🚀 Загрузка на Mac и подпись... \n(Не закрывай вкладку)");

    const formData = new FormData();
    formData.append('ipa', ipaFile);
    formData.append('p12', p12File);
    formData.append('prov', provFile);
    formData.append('password', password);
    // BundleID можно добавить через доп. инпут, если нужно

    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        updateStatus("✅ Готово! Начинаю скачивание...");

        // Получаем подписанный файл
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        // Автоматическое скачивание
        const a = document.createElement('a');
        a.href = url;
        a.download = `Signed_${ipaFile.name}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

        updateStatus("✨ Успешно подписано и скачано!");

    } catch (err) {
        updateStatus(`❌ Ошибка: ${err.message}`);
        console.error(err);
    } finally {
        signBtn.disabled = false;
        signBtn.style.opacity = "1";
    }
};
