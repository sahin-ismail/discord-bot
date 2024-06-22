// WitAI
let witAI_lastcallTS = null;
require('dotenv').config();
const witClient = require('node-witai-speech');
const util = require('util');
const { Readable } = require('stream');

async function transcribe_witai(buffer) {
    try {
        // ensure we do not send more than one request per second
        if (witAI_lastcallTS != null) {
            let now = Math.floor(new Date());
            while (now - witAI_lastcallTS < 1000) {
                console.log('sleep')
                await sleep(100);
                now = Math.floor(new Date());
            }
        }
    } catch (e) {
        console.log('transcribe_witai 837:' + e)
    }

    try {
        console.log('transcribe_witai')
        const extractSpeechIntent = util.promisify(witClient.extractSpeechIntent);
        var stream = Readable.from(buffer);
        const contenttype = "audio/raw;encoding=signed-integer;bits=16;rate=48k;endian=little"
        const output = await extractSpeechIntent(process.env.WITAPIKEY, stream, contenttype)
        witAI_lastcallTS = Math.floor(new Date());
        if (output && output.length > 0) {
            let res = output.split('\n');
            res = res.filter((el) => {
                return (el.indexOf(`  "text`) != -1)
            });
            res = res[res.length - 1];
            res = res.split(`: "`)[1];
            res = res.slice(0, res.length - 1);
            stream.destroy()
            return {
                'status': 'ok',
                'message': res
            };
        } else {
            return {
                'status': 'error',
                'message': 'Anlayamadım'
            };
        }
    } catch (e) {
        console.log('transcribe_witai 851:' + e); console.log(e)
        return {
            'status': 'error',
            'message': e
        };
    }
}

module.exports = { transcribe_witai }