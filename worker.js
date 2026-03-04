// Подключаем JSZip для починки прав файлов и сам zsign
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
importScripts('zsign.js');

self.onmessage = async function(e) {
    const { ipaData, p12Data, provData, password } = e.data;
    try {
        self.postMessage({ type: 'status', msg: '1/5 Initializing WASM Engine...' });
        
        const zsignModule = await createZSignModule({
            print: function(text) {
                self.postMessage({ type: 'stdout', msg: text });
            },
            printErr: function(text) {
                self.postMessage({ type: 'stderr', msg: text });
            }
        });

        self.postMessage({ type: 'status', msg: '2/5 Loading files to Virtual FS...' });
        zsignModule.FS.writeFile('app.ipa', new Uint8Array(ipaData));
        zsignModule.FS.writeFile('cert.p12', new Uint8Array(p12Data));
        zsignModule.FS.writeFile('prov.mobileprovision', new Uint8Array(provData));

        self.postMessage({ type: 'status', msg: '3/5 Signing...' });
        
        const args = [
            'app.ipa',
            '-k', 'cert.p12',
            '-p', password || '',
            '-m', 'prov.mobileprovision',
            '-o', 'signed.ipa',
            '-f',
            '-z', '0', // Внутри zsign отключаем сжатие для скорости
            '-b', 'app.raspberry9732.test9663'
        ];
        
        zsignModule.callMain(args);

        self.postMessage({ type: 'status', msg: '4/5 Fixing POSIX permissions (chmod +x)...' });
        
        // Достаем "сломанный" архив из WASM
        const signedIpaData = zsignModule.FS.readFile('signed.ipa');
        
        // Открываем его через JSZip
        const zip = await JSZip.loadAsync(signedIpaData);
        
        // Проходимся по ВСЕМ файлам внутри архива и жестко ставим права 0755 (rwxr-xr-x)
        // В десятичной системе 0755 (octal) — это 493
        for (const relativePath in zip.files) {
            zip.files[relativePath].unixPermissions = 0o755;
        }

        self.postMessage({ type: 'status', msg: '5/5 Repacking fixed IPA...' });
        
        // Запаковываем обратно уже с правильными правами и сжатием 9 уровня
        const fixedData = await zip.generateAsync({
            type: "uint8array",
            compression: "DEFLATE",
            compressionOptions: { level: 9 }
        });

        // Чистим виртуальную файловую систему
        zsignModule.FS.unlink('app.ipa');
        zsignModule.FS.unlink('cert.p12');
        zsignModule.FS.unlink('prov.mobileprovision');
        zsignModule.FS.unlink('signed.ipa');

        // Отдаем починенный буфер
        self.postMessage({ type: 'done', data: fixedData.buffer }, [fixedData.buffer]);
        
    } catch (error) {
        self.postMessage({ type: 'error', msg: error.toString() });
    }
};
