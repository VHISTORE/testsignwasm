importScripts('zsign.js');

// === БИНАРНЫЙ ПАТЧЕР ПРАВ (МАГИЯ) ===
function fixZipPermissions(zipData) {
    const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength);
    const length = zipData.length;
    let patchedCount = 0;

    for (let i = 0; i < length - 46; i++) {
        // Ищем сигнатуру Central Directory: PK\x01\x02 (0x02014B50 в Little Endian)
        if (zipData[i] === 0x50 && zipData[i+1] === 0x4B && zipData[i+2] === 0x01 && zipData[i+3] === 0x02) {
            
            const versionMadeBy = view.getUint16(i + 4, true);
            const filenameLen = view.getUint16(i + 28, true);
            
            // Защита от выхода за пределы массива
            if (i + 46 + filenameLen > length) continue;
            
            // Читаем имя файла
            const filename = new TextDecoder().decode(zipData.subarray(i + 46, i + 46 + filenameLen));
            
            // Определяем, папка это или файл, и нужен ли ему исполняемый бит
            const isDir = filename.endsWith('/');
            // Главный бинарник обычно лежит в .app/ и не имеет расширения
            const isAppBinary = filename.includes('.app/') && !filename.split('/').pop().includes('.');
            const isDylibOrScript = filename.endsWith('.dylib') || filename.endsWith('.sh');
            
            // ВАЖНО: Форсируем операционную систему UNIX (3) в старший байт versionMadeBy
            view.setUint16(i + 4, (3 << 8) | (versionMadeBy & 0xFF), true);
            
            // Офсет 38 в CD - это External file attributes (4 байта)
            if (isDir) {
                view.setUint32(i + 38, 0x41ED0000, true); // Права 0755 для папки
            } else if (isAppBinary || isDylibOrScript) {
                view.setUint32(i + 38, 0x81ED0000, true); // Права 0755 для исполняемого файла
            } else {
                view.setUint32(i + 38, 0x81A40000, true); // Права 0644 для обычных файлов
            }
            patchedCount++;
        }
    }
    return patchedCount;
}

self.onmessage = async function(e) {
    const { ipaData, p12Data, provData, password } = e.data;
    try {
        self.postMessage({ type: 'status', msg: '1/4 Initializing WASM Engine...' });
        
        const zsignModule = await createZSignModule({
            print: function(text) { self.postMessage({ type: 'stdout', msg: text }); },
            printErr: function(text) { self.postMessage({ type: 'stderr', msg: text }); }
        });

        self.postMessage({ type: 'status', msg: '2/4 Loading files to Virtual FS...' });
        
        zsignModule.FS.writeFile('app.ipa', new Uint8Array(ipaData));
        zsignModule.FS.writeFile('cert.p12', new Uint8Array(p12Data));
        zsignModule.FS.writeFile('prov.mobileprovision', new Uint8Array(provData));

        self.postMessage({ type: 'status', msg: '3/4 Signing & Compressing...' });
        
        // Обычная подпись со стандартным сжатием
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

        self.postMessage({ type: 'status', msg: '4/4 Applying Binary Permissions Patch...' });
        
        const signedIpaData = zsignModule.FS.readFile('signed.ipa');
        
        // Копируем данные, чтобы можно было их изменять
        const editableData = new Uint8Array(signedIpaData);
        
        // ЗАПУСКАЕМ БИНАРНЫЙ ПАТЧЕР!
        const patchedCount = fixZipPermissions(editableData);
        self.postMessage({ type: 'stdout', msg: `Fixed UNIX permissions for ${patchedCount} files/folders directly in HEX.` });

        zsignModule.FS.unlink('app.ipa');
        zsignModule.FS.unlink('cert.p12');
        zsignModule.FS.unlink('prov.mobileprovision');
        zsignModule.FS.unlink('signed.ipa');

        self.postMessage({ type: 'done', data: editableData.buffer }, [editableData.buffer]);
        
    } catch (error) {
        self.postMessage({ type: 'error', msg: error.toString() });
    }
};
