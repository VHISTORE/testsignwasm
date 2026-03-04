importScripts('zsign.js');

self.onmessage = async function(e) {
    const { ipaData, p12Data, provData, password } = e.data;
    try {
        self.postMessage({ type: 'status', msg: '1/3 Initializing WASM Engine & Syscall Hooks...' });
        
        const zsignModule = await createZSignModule({
            print: function(text) { self.postMessage({ type: 'stdout', msg: text }); },
            printErr: function(text) { self.postMessage({ type: 'stderr', msg: text }); }
        });

        // =====================================================================
        // МАГИЯ: ПЕРЕХВАТ СИСТЕМНЫХ ВЫЗОВОВ (SYSCALL HOOKS)
        // Мы перехватываем C++ функцию stat() на уровне виртуальной машины WASM.
        // Когда zsign будет спрашивать "какие права у этого файла?", мы будем
        // жестко отдавать 0755 для бинарников и 0644 для остального мусора.
        // =====================================================================
        
        const originalStat = zsignModule.FS.stat;
        zsignModule.FS.stat = function(path, dontFollow) {
            const attr = originalStat.call(zsignModule.FS, path, dontFollow);
            
            // Проверяем, что файл лежит внутри распакованного приложения
            if (path.includes('Payload/') && path.includes('.app')) {
                const isDir = zsignModule.FS.isDir(attr.mode);
                const filename = path.split('/').pop();
                
                // Вычисляем, нужен ли файлу флаг +x (Executable)
                // Бинарники обычно не имеют расширения (точки), + скрипты и библиотеки
                const isExecutable = isDir || !filename.includes('.') || filename.endsWith('.dylib') || filename.endsWith('.sh');
                
                if (isExecutable) {
                    attr.mode = (attr.mode & ~0o777) | 0o755; // Ставим rwxr-xr-x
                } else {
                    attr.mode = (attr.mode & ~0o777) | 0o644; // Ставим rw-r--r--
                }
            }
            return attr;
        };

        // Дублируем для lstat (чтобы покрыть все пути)
        const originalLstat = zsignModule.FS.lstat;
        zsignModule.FS.lstat = function(path) {
            const attr = originalLstat.call(zsignModule.FS, path);
            
            if (path.includes('Payload/') && path.includes('.app')) {
                const isDir = zsignModule.FS.isDir(attr.mode);
                const filename = path.split('/').pop();
                const isExecutable = isDir || !filename.includes('.') || filename.endsWith('.dylib') || filename.endsWith('.sh');
                
                if (isExecutable) {
                    attr.mode = (attr.mode & ~0o777) | 0o755;
                } else {
                    attr.mode = (attr.mode & ~0o777) | 0o644;
                }
            }
            return attr;
        };
        // =====================================================================

        self.postMessage({ type: 'status', msg: '2/3 Loading files to Virtual FS...' });
        zsignModule.FS.writeFile('app.ipa', new Uint8Array(ipaData));
        zsignModule.FS.writeFile('cert.p12', new Uint8Array(p12Data));
        zsignModule.FS.writeFile('prov.mobileprovision', new Uint8Array(provData));

        self.postMessage({ type: 'status', msg: '3/3 Signing with proper POSIX hashes...' });
        
        // Запускаем zsign с максимальным сжатием -z 9
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
        
        zsignModule.callMain(args);

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
