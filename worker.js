importScripts('zsign.js');

self.onmessage = async function(e) {
    const { ipaData, p12Data, provData, password } = e.data;

    try {
        self.postMessage({ type: 'status', msg: '1/4 Initializing WASM Engine...' });
        const zsignModule = await createZSignModule();

        self.postMessage({ type: 'status', msg: '2/4 Loading files to Virtual FS...' });
        zsignModule.FS.writeFile('app.ipa', new Uint8Array(ipaData));
        zsignModule.FS.writeFile('cert.p12', new Uint8Array(p12Data));
        zsignModule.FS.writeFile('prov.mobileprovision', new Uint8Array(provData));

        self.postMessage({ type: 'status', msg: '3/4 Signing (CPU is working hard)...' });
        const args = ['-k', 'cert.p12', '-p', password, '-m', 'prov.mobileprovision', '-o', 'signed.ipa', 'app.ipa'];
        
        // Запуск C++ движка
        zsignModule.callMain(args);

        self.postMessage({ type: 'status', msg: '4/4 Extracting signed file...' });
        const signedIpaData = zsignModule.FS.readFile('signed.ipa');

        // ВАЖНО: Копируем данные из памяти WASM, чтобы безопасно передать их
        const safeData = signedIpaData.slice();

        // Очищаем виртуалку ДО отправки файла, чтобы освободить оперативку
        zsignModule.FS.unlink('app.ipa');
        zsignModule.FS.unlink('cert.p12');
        zsignModule.FS.unlink('prov.mobileprovision');
        zsignModule.FS.unlink('signed.ipa');

        // Отправляем готовый файл
        self.postMessage({
            type: 'done',
            data: safeData.buffer
        }, [safeData.buffer]); // Transferable object

    } catch (error) {
        self.postMessage({ type: 'error', msg: error.toString() });
    }
};
