importScripts('zsign.js');

self.onmessage = async function(e) {
    const { ipaData, p12Data, provData, password } = e.data;

    try {
        self.postMessage({ type: 'status', msg: '1/4 Initializing WASM Engine...' });
        
        // ВАЖНО: Подключаемся к "консоли" WASM движка и отправляем текст в main.js
        const zsignModule = await createZSignModule({
            print: function(text) {
                self.postMessage({ type: 'stdout', msg: text });
            },
            printErr: function(text) {
                self.postMessage({ type: 'stderr', msg: text });
            }
        });

        self.postMessage({ type: 'status', msg: '2/4 Loading files to Virtual FS...' });
        zsignModule.FS.writeFile('app.ipa', new Uint8Array(ipaData));
        zsignModule.FS.writeFile('cert.p12', new Uint8Array(p12Data));
        zsignModule.FS.writeFile('prov.mobileprovision', new Uint8Array(provData));

        self.postMessage({ type: 'status', msg: '3/4 Signing with Force flags...' });
        
        const args = [
            '-k', 'cert.p12', 
            '-p', password, 
            '-m', 'prov.mobileprovision', 
            '-f', 
            '-o', 'signed.ipa', 
            'app.ipa'
        ];
        
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
