importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
importScripts('zsign.js');

self.onmessage = async function(e) {
    const { ipaData, p12Data, provData, password } = e.data;
    try {
        self.postMessage({ type: 'status', msg: '1/6 Initializing WASM Engine...' });
        
        const zsignModule = await createZSignModule({
            print: function(text) { self.postMessage({ type: 'stdout', msg: text }); },
            printErr: function(text) { self.postMessage({ type: 'stderr', msg: text }); }
        });

        self.postMessage({ type: 'status', msg: '2/6 Repairing IPA Permissions (Pre-processing)...' });
        
        // --- ШАГ ПРЕДОБРАБОТКИ ---
        // Открываем сломанный IPA
        const zip = await JSZip.loadAsync(ipaData);
        
        // Проходим по файлам и форсируем права
        for (const relativePath in zip.files) {
            const file = zip.files[relativePath];
            
            // Если это папка
            if (file.dir) {
                file.unixPermissions = 0o755;
            } else {
                // Если это файл
                // Даем права на исполнение бинарникам, dylib и скриптам
                if (relativePath.includes('.app/') && (!relativePath.includes('.') || relativePath.endsWith('.dylib') || relativePath.endsWith('.sh'))) {
                    file.unixPermissions = 0o755;
                } else {
                    file.unixPermissions = 0o644;
                }
            }
        }
        
        // Собираем чистый UNIX-архив (без сжатия для скорости, сожмем потом в zsign)
        self.postMessage({ type: 'status', msg: '3/6 Creating Clean UNIX Archive...' });
        const cleanIpaData = await zip.generateAsync({
            type: "uint8array",
            compression: "STORE", // Быстрая перепаковка
            platform: "UNIX"      // ЖЕСТКИЙ ФОРС UNIX-ПРАВ
        });

        // --- ШАГ ПОДПИСИ ---
        self.postMessage({ type: 'status', msg: '4/6 Loading files to Virtual FS...' });
        
        // Передаем в zsign УЖЕ ПОЧИНЕННЫЙ архив
        zsignModule.FS.writeFile('app.ipa', cleanIpaData);
        zsignModule.FS.writeFile('cert.p12', new Uint8Array(p12Data));
        zsignModule.FS.writeFile('prov.mobileprovision', new Uint8Array(provData));

        self.postMessage({ type: 'status', msg: '5/6 Signing & Compressing...' });
        
        const args = [
            'app.ipa',
            '-k', 'cert.p12',
            '-p', password || '',
            '-m', 'prov.mobileprovision',
            '-o', 'signed.ipa',
            '-f',
            '-z', '9', // Сжимаем на финальном этапе
            '-b', 'app.raspberry9732.test9663'
        ];
        
        zsignModule.callMain(args);

        self.postMessage({ type: 'status', msg: '6/6 Extracting signed file...' });
        
        const signedIpaData = zsignModule.FS.readFile('signed.ipa');
        const safeData = signedIpaData.slice();

        zsignModule.FS.unlink('app.ipa');
        zsignModule.FS.unlink('cert.p12');
        zsignModule.FS.unlink('prov.mobileprovision');
        zsignModule.FS.unlink('signed.ipa');

        self.postMessage({ type: 'done', data: safeData.buffer }, [safeData.buffer]);
        
    } catch (error) {
        self.postMessage({ type: 'error', msg: error.toString() });
    }
};
