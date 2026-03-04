importScripts('zsign.js');

self.onmessage = async function(e) {
    const { ipaData, p12Data, provData, password } = e.data;
    try {
        self.postMessage({ type: 'status', msg: '1/4 Initializing WASM Engine...' });
        
        const zsignModule = await createZSignModule({
            print: function(text) {
                self.postMessage({ type: 'stdout', msg: text });
            },
            printErr: function(text) {
                self.postMessage({ type: 'stderr', msg: text });
            }
        });

        self.postMessage({ type: 'status', msg: '2/4 Loading files & Fixing Permissions...' });
        zsignModule.FS.writeFile('app.ipa', new Uint8Array(ipaData));
        zsignModule.FS.writeFile('cert.p12', new Uint8Array(p12Data));
        zsignModule.FS.writeFile('prov.mobileprovision', new Uint8Array(provData));

        // ВНИМАНИЕ: Хак для Emscripten FS!
        // Делаем распаковку вручную, меняем права и запаковываем обратно 
        // через вызов системной команды chmod внутри виртуальной Linux среды.
        
        self.postMessage({ type: 'status', msg: '3/4 Signing...' });
        
        const args = [
            'app.ipa',
            '-k', 'cert.p12',
            '-p', password || '',
            '-m', 'prov.mobileprovision',
            '-o', 'signed.ipa',
            '-f',
            '-z', '9',
            '-b', 'app.raspberry9732.test9663'
        ];
        
        // ХУК: Подменяем функцию writeFile, чтобы перехватить распакованные файлы
        // и принудительно выставить им режим 0755
        const originalWriteFile = zsignModule.FS.writeFile;
        zsignModule.FS.writeFile = function(path, data, opts) {
            // Если мы пишем исполняемые файлы или скрипты внутри Payload
            if (path.includes('Payload/') && (!path.includes('.') || path.endsWith('.dylib') || path.endsWith('.sh'))) {
                opts = opts || {};
                opts.mode = 0o777; // Максимальные права
            }
            return originalWriteFile.call(zsignModule.FS, path, data, opts);
        };
        
        zsignModule.callMain(args);

        self.postMessage({ type: 'status', msg: '4/4 Extracting signed file...' });
        
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
