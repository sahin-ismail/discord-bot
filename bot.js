const Discord = require('discord.js');
const config = require("./config.json");
var Long = require("long");
const fs = require('fs');
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');
const axios = require('axios')
const qs = require('querystring')
require('dotenv').config();
const dialogflow = require('@google-cloud/dialogflow');
const uuid = require('uuid');
const { transcribe_witai } = require('./audio-processing')

//added for heroku bug
var express = require('express');
var app = express();
app.set('port', (process.env.PORT || 5000));
app.get('/', function (request, response) {
    var result = 'App is running'
    response.send(result);
}).listen(app.get('port'), function () {
    console.log('App is running, server is listening on port ', app.get('port'));
});

const client = new Discord.Client();
projectId = process.env.PROJECT_ID;

// A unique identifier for the given session
const sessionId = uuid.v4();

// Create a new session
const sessionClient = new dialogflow.SessionsClient();
let dispatcher;
let isPlaying = false;

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setStatus("online");
    client.user.setActivity("Ali Kemal iş başında.", { type: "PLAYING" })

    setInterval(sendSoz, 10 * 60000); // sendSoz every 55mins
    setInterval(covidAnons, 10 * 60000); // covidAnons every 60mins

    setInterval(function () {
        client.guilds.cache.forEach(guild => {
            getDefaultChannel(guild).send('Neredesiniz millet !?');
        });
    }, 23 * 60000);
});

//for small talk chat
async function replyMsg(textMsg) {
    const sessionPath = await sessionClient.projectAgentSessionPath(
        projectId,
        sessionId
    );

    // The text query request.
    const request = {
        session: sessionPath,
        queryInput: {
            text: {
                text: textMsg,
                languageCode: 'en-US',
            },
        },
    };

    // Send request and log result
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;
    return await result.fulfillmentText;
}

client.on('message', async message => {
    // ignore any message that does not start with our prefix
    if (message.content.toLowerCase().indexOf(config.prefix) !== 0) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/g);

    //const args = message.content.slice(prefix.length).split(' ');
    const command = args.shift().toLowerCase();

    console.log("command:" + command);
    console.log("args:" + args);
    if (command === "ping") {
        ping(args, message);
        message.delete({
            timeout: 30000
        }); // Delete commands from text channel after 10 secs
    } else if (command === "?") {
        if (message.member.voice.channel) {
            const connection = await message.member.voice.channel.join();
            playAudio(connection, './audio/soru.mp3');
        }
        message.delete({
            timeout: 30000
        }); // Delete commands from text channel after 10 secs
    } else if (command === "konuş") {
        if (message.member.voice.channel) {
            await message.member.voice.channel.join();
            sendSoz(parseInt(args));
        }
        message.delete({
            timeout: 30000
        }); // Delete commands from text channel after 10 secs
    } else if (command === "uza") {
        //voiceChannel = await message.member.voice.channel;
        if (message.guild.me.voice.channel.id === message.member.voice.channel.id) {
            const connection = await message.member.voice.channel.join();
            playAudio(connection, './audio/gul.mp3', true);
            //await message.member.voiceChannel.leave();
        } else {
            await message.channel.send("sebeb ?");
        }
        message.delete({
            timeout: 30000
        }); // Delete commands from text channel after 10 secs
    } else if (command === "git") {
        leave(message);
    } else if (command === "çal") {
        play(message, args, true);
    } else if (command === "sus") {
        silent(dispatcher, message, true);
    } else if (command === "kökle") {
        full(dispatcher, message, true);
    } else if (command === "yavaş") {
        middle(dispatcher, message, true);
    } else if (command === "gel") {
        if (!message.member.voice.channel) return message.reply('Önce sesli kanala katıl!');
        // //if ((message.member.voice.channel.members.filter((e) => client.user.id === e.user.id).size > 0)) return message.reply(`I'm already in your voice channel!`);

        if (!message.member.voice.channel.joinable) return message.reply(`I don't have permission to join that voice channel!`);
        if (!message.member.voice.channel.speakable) return message.reply(`I don't have permission to speak in that voice channel!`);

        const connection = await message.member.voice.channel.join(); // https://discordjs.guide/voice/
        await message.channel.send('sa');
        //scrollingText(response);

        playAudio(connection, './audio/sa.mp3');
        message.delete({
            timeout: 30000
        }); // Delete commands from text channel after 10 secs

        connection.on('speaking', async (user, speaking) => { // https://discord.js.org/#/docs/main/stable/class/VoiceConnection?scrollTo=speaking
            if (speaking.bitfield == 0 || user.bot) {
                return
            }
            console.log(`Seni dinliyorum ${user.username}`)
            // this creates a 16-bit signed PCM, stereo 48KHz stream
            const audioStream = connection.receiver.createStream(user, { mode: 'pcm' })
            audioStream.on('error', (e) => {
                console.log('audioStream: ' + e)
            });
            let buffer = [];
            audioStream.on('data', (data) => {
                buffer.push(data)
            })
            audioStream.on('end', async () => {
                buffer = Buffer.concat(buffer)
                const duration = buffer.length / 48000 / 4;
                console.log("duration: " + duration)

                if (duration < 1.0 || duration > 19) { // 20 seconds max dur
                    console.log("TOO SHORT / TOO LONG; SKPPING")
                    return;
                }
                try {
                    let new_buffer = await convert_audio(buffer)
                    let out = await transcribe_witai(new_buffer);
                    if (out != null) {
                        await processVoiceCommands(connection, message, out);
                    }

                } catch (e) {
                    console.log('tmpraw rename: ' + e)
                }
            })
        });
    } else if (!message.author.bot) {
        if (message.member.voice.channel) {
            const connection = await message.member.voice.channel.join();
            playAudio(connection, './audio/soru.mp3');
        }
        message.delete({
            timeout: 30000
        }); // Delete commands from text channel after 10 secs
        //closed for heroku error
        // let mm = message.content.split(' ');
        // mm = mm.slice(1, mm.length);

        // mm = mm.join(' ');
        // console.log(mm);
        // replyMsg(mm).then((res) => {
        //     message.reply(res);
        // });
    }

});

client.on("voiceStateUpdate", async function (oldVoiceState, newVoiceState) {
    let newUserChannel = newVoiceState.member.voice.channel;
    let oldUserChannel = oldVoiceState.member.voice.channel;

    console.log("voiceStateUpdate: \n oldVoiceState:" + oldVoiceState + "\n newVoiceState:" + newVoiceState);
    console.log("voiceStateUpdate: \n newUserChannel:" + newUserChannel + "\n oldUserChannel:" + oldUserChannel);

    if (oldUserChannel === null && newUserChannel === null) { // User disconnected
    } else { // User Joins a voice channel
        if (!newVoiceState.member.voice.selfMute) { // If the stateUpdate isn't a mute/unmute action
            const connection = await newUserChannel.join();
        }
    }

});

async function processVoiceCommands(connection, message, out) {
    console.log(out);
    if (out) {
        let mm = out.message;
        let args;
        let command;
        if (!mm && mm.length <= 0) {
            return;
        }
        mm = mm.toLowerCase();
        mm = mm.split(' ');
        console.log(mm);
        mm[0] = mm[0].replace(/,'./g, "");
        if (mm[0].indexOf(config.pre) != -1) {
            args = mm.slice(2)
            command = args.shift();
        } else if (mm[0].indexOf(config.fix) != -1) {
            args = mm.slice(1)
            command = args.shift();
        } else {
            return;
        }
        command = command.replace(/,'./g, "");
        if (command.indexOf('çal') != -1 || command.indexOf('başla') != -1) {
            play(message, args);
        } else if (command.indexOf('yavaş') != -1 || command.indexOf('sakin') != -1) {
            middle(dispatcher, message);
        } else if (command.indexOf('sus') != -1 || command.indexOf('kes') != -1) {
            silent(dispatcher, message);
        } else if (command.indexOf('kökle') != -1 || command.indexOf('ses') != -1) {
            full(dispatcher, message);
        } else if (command.indexOf('git') != -1 || command.indexOf('çık') != -1) {
            leave(message);
        }


    }

}

function silent(dispatcher, message, isFromText) {
    if (dispatcher) {
        dispatcher.setVolumeLogarithmic(0);
        isPlaying = false;
    }
    if (isFromText) {
        message.delete({
            timeout: 30000
        }); // Delete commands from text channel after 10 secs
    }
}

function full(dispatcher, message, isFromText) {
    if (dispatcher) {
        dispatcher.setVolumeLogarithmic(1);
    }
    if (isFromText) {
        message.delete({
            timeout: 30000
        }); // Delete commands from text channel after 10 secs
    }
}

function middle(dispatcher, message, isFromText) {
    if (dispatcher) {
        dispatcher.setVolumeLogarithmic(0.5);
    }
    if (isFromText) {
        message.delete({
            timeout: 30000
        }); // Delete commands from text channel after 10 secs
    }
}
async function playAudio(connection, path, isDisconnect) {
    if (!isPlaying) {
        isPlaying = true;
        dispatcher = await connection.play(path);
        dispatcher.on('finish', function () {
            isPlaying = false;
            if (isDisconnect) {
                connection.disconnect();
            }
        });
        return true;
    }
    else {
        return false;
    }
}
async function play(message, args, isFromText) {
    if (message.member.voice.channel) {
        const voiceChannel = message.member.voice.channel;
        const permissions = voiceChannel.permissionsFor(message.client.user);
        if (!permissions.has('CONNECT')) return message.channel.send('İznin yok.');
        if (!permissions.has('SPEAK')) return message.channel.send('İznin yok.');
        if (args.length == 0) return message.channel.send('Url gönder.');

        const connection = await voiceChannel.join();

        const videoFinder = async (query) => {
            const videoResult = await ytSearch(query);
            return (videoResult.videos.length > 1) ? videoResult.videos[0] : null;
        }

        const video = await videoFinder(args.join(' '));
        if (video) {
            const stream = ytdl(video.url, { filter: 'audioonly' });
            isPlaying = true;
            dispatcher = connection.play(stream, { seek: 0, volume: 1 })
                .on('finish', () => {
                    voiceChannel.leave();
                    isPlaying = false;
                });
            await message.reply(`Now playing... ***${video.title}***`);
        } else {
            message.reply(`No video results found.`);
        }
    } else {
        message.reply(`Ses kanalında değilsin.`);
    }
    if (isFromText) {
        message.delete({
            timeout: 30000
        }); // Delete commands from text channel after 10 secs
    }

}

async function leave(message) {
    //voiceChannel = await message.member.voice.channel;
    if (message.guild.me.voice.channel.id === message.member.voice.channel.id) {
        const connection = await message.member.voice.channel.join();
        await message.member.voice.channel.leave();
        //await message.member.voiceChannel.leave();
    } else {
        await message.channel.send("sebeb ?");
    }
    message.delete({
        timeout: 30000
    }); // Delete commands from text channel after 10 secs
}

async function ping(args, message) {
    const m = await message.channel.send("hallediliyor...");
    m.edit(`komut ayıkma sürem ${m.createdTimestamp - message.createdTimestamp}ms, servera pingim ${Math.round(client.ping)}ms`);
    message.delete({
        timeout: 30000
    }); // Delete commands from text channel after 10 secs

}

async function convert_audio(input) {
    try {
        // stereo to mono channel
        const data = new Int16Array(input)
        const ndata = new Int16Array(data.length / 2)
        for (let i = 0, j = 0; i < data.length; i += 4) {
            ndata[j++] = data[i]
            ndata[j++] = data[i + 1]
        }
        return Buffer.from(ndata);
    } catch (e) {
        console.log(e)
        console.log('convert_audio: ' + e)
        throw e;
    }
}

const getDefaultChannel = (guild) => {
    const generalChannel = guild.channels.cache.find(channel => channel.name === "general");
    if (generalChannel)
        return generalChannel;

    return guild.channels.cache
        .filter(c => c.type === "text" &&
            c.permissionsFor(guild.client.user).has("SEND_MESSAGES"))
        .sort((a, b) => a.position - b.position ||
            Long.fromString(a.id).sub(Long.fromString(b.id)).toNumber())
        .first();
}

const sendSoz = function (sozId) {
    let jsonfile = fs.readFileSync('sozler.json');
    let parsedJson = JSON.parse(jsonfile);
    client.guilds.cache.forEach(guild => {
        client.voice.connections.forEach(connection => {
            playAudio(connection, './audio/klavye.mp3');
        });

        // Pick random if no arg
        if (Number.isNaN(sozId) || sozId === undefined) {
            sozId = Math.floor(Math.random() * parsedJson.sozler.length);
        }
        if (Number.isInteger(sozId) && parsedJson.sozler.length <= sozId) {
            // ERROR
            client.voice.connections.forEach(connection => {
                playAudio(connection, './audio/zurna.mp3');
            });
            return;
        }
        setTimeout(() => {
            getDefaultChannel(guild).send(parsedJson.sozler[sozId].text).then((sentMsg) => {
                sentMsg.delete({
                    timeout: 30000
                }); // Delete commands from text channel after 30 secs
            });
            client.voice.connections.forEach(connection => {
                playAudio(connection, parsedJson.sozler[sozId].path);
            });
        }, 7000);
    });
};

const covidAnons = function () {
    client.guilds.cache.forEach(guild => {
        client.voice.connections.forEach(connection => {
            playAudio(connection, './audio/covidanons.mp3');
        });
    });
};

client.login(process.env.TOKEN);