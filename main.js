// Находим кнопку и вешаем событие
const signBtn = document.getElementById('signBtn'); // проверь ID кнопки в HTML

signBtn.onclick = async () => {
    // Получаем файлы из input-ов
    const ipaFile = document.getElementById('ipaInput').files[0];
    const p12File = document.getElementById('p12Input').files[0];
    const provFile = document.getElementById('provInput').files[0];
    const password = document.getElementById('passwordInput').value;
    const bundleId = document.getElementById('bundleIdInput').value;

    // Базовая проверка
    if (!ipaFile || !p12File || !provFile) {
        alert("Пожалуйста, выбери все файлы: IPA, P12 и Mobileprovision");
        return;
    }

    // Блокируем кнопку, чтобы не тыкали сто раз
    signBtn.disabled = true;
    const originalText = signBtn.innerText;
    signBtn.innerText = "Signing...";

    // Вызываем нашу новую функцию (которую мы написали выше)
    try {
        await signIpa(ipaFile, p12File, provFile, password, bundleId);
    } catch (e) {
        alert("Ошибка: " + e.message);
    } finally {
        signBtn.disabled = false;
        signBtn.innerText = originalText;
    }
};
