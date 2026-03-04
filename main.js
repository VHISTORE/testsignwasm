const signBtn = document.getElementById('sign-btn');
const statusDiv = document.getElementById('status');

// ОБНОВЛЯЙ ЭТУ ССЫЛКУ ПРИ КАЖДОМ ЗАПУСКЕ CLOUDFLARED
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

    signBtn.disabled = true;
    signBtn.style.opacity = "0.5";
    updateStatus("🚀 Отправка на MacBook... \nПодпись и создание ссылки установки...");

    const formData = new FormData();
    formData.append('ipa', ipaFile);
    formData.append('p12', p12File);
    formData.append('prov', provFile);
    formData.append('password', password);
    formData.append('bundleId', 'com.ursa.test.app'); // Можно добавить инпут для этого

    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const result = await response.json();

        if (result.installUrl) {
            updateStatus("✅ Готово! Сейчас появится запрос на установку.");
            // Переход по протоколу itms-services вызывает системное окно iOS
            window.location.href = result.installUrl;
        } else {
            throw new Error("Сервер не вернул ссылку на установку.");
        }

    } catch (err) {
        updateStatus(`❌ Ошибка: ${err.message}`);
        console.error(err);
    } finally {
        signBtn.disabled = false;
        signBtn.style.opacity = "1";
    }
};
