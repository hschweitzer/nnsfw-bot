require('dotenv').config()
const Discord = require('discord.js');
const vision = require('@google-cloud/vision');
const request = require('request').defaults({ encoding: null });
const client = new vision.ImageAnnotatorClient();
const bot = new Discord.Client();
const filename = './server-settings.json';
const serversettings = require(filename);
const fs = require('fs');
const token = process.env.BOT_TOKEN;
const ratings = [
    'VERY_UNLIKELY',
    'UNLIKELY',
    'POSSIBLE',
    'LIKELY',
    'VERY_LIKELY'
];

bot.on('message', (msg) => {
    if (!msg.system && !msg.channel.nsfw && !msg.author.bot) {
        const serverid = msg.guild.id;
        checkDefaultSettings(serverid);
        const prefix = serversettings.servers[serverid].prefix;
        if (msg.attachments.size > 0 || msg.embeds.length > 0) {
            let url;
            if (msg.attachments.size > 0) {
                url = msg.attachments.array()[0].url;
            } else {
                url = msg.embeds[0].url;
            }
            const filter = (reaction, user) => reaction.emoji.name === '🔞';
            msg.react('🔞');
            msg.awaitReactions(filter, { max: 3, time: 1800000 }).then(collected => {
                const member = msg.guild.member(collected.array()[0].users.last());
                if (member.hasPermission('MANAGE_MESSAGES') || collected.size >= 3) {
                    let destinationid;
                    if (destinationid = getnsfwChannel(serverid, msg.channel.id)) {
                        destinationchannel = msg.guild.channels.get(destinationid);
                        destinationchannel.send(url);
                        msg.reply('ce message a été jugé inapproprié et a été déplacé dans #' + destinationchannel.name);
                        msg.delete();
                    }
                }
            });

            request.get(url, (error, response, body) => {
                if (!error && response.statusCode == 200) {
                    const request = {
                        image: {
                            content: Buffer.from(body)
                        }
                    };

                    client
                    .safeSearchDetection(request)
                    .then(response => {
                        const rating = response[0].safeSearchAnnotation;
                        if (ratings.indexOf(rating.adult) >= (serversettings.servers[serverid].actions.autoremovelvl - 1)) {
                            let destinationid;
                            if (destinationid = getnsfwChannel(serverid, msg.channel.id)) {
                                destinationchannel = msg.guild.channels.get(destinationid);
                                destinationchannel.send(url);
                                msg.reply('cette image a été automatiquement détectée comme étant inapproprié et a été déplacé dans #' + destinationchannel.name);
                            } else {
                                msg.channel.send('cette image a été automatiquement détectée comme étant inappropriée et a été supprimée.');
                            }
                            msg.delete();
                        }
                    })
                    .catch(err => {
                        console.error(err);
                    });
                }
            });
        } else if (msg.content.charAt(0) === prefix) {
            const content = msg.content.toString();
            const isAdmin = msg.guild.member(msg.author).hasPermission('ADMINISTRATOR');
            switch (content.split(' ')[0].toLowerCase()) {
                case prefix + 'nhelp':
                    msg.author.createDM().then((dm) => {
                        dm.send({embed: serversettings.helpmessage});
                    });
                    msg.reply('une aide vous a été envoyée par message privé.');
                    break;
                case prefix + 'nsc':
                case prefix + 'nsetchannel':
                    if (isAdmin) {
                        const firstchannelid = content.split(' ')[1];
                        const secondchannelid = content.split(' ')[2];
                        let firstchannel;
                        let secondchannel;
                        let errors = 0;
                        if ((firstchannel = msg.guild.channels.find('id', firstchannelid)) === null) {
                            msg.channel.send('Le premier channel n\'existe pas !');
                            errors++;
                        }
                        if ((secondchannel = msg.guild.channels.find('id', secondchannelid)) === null) {
                            msg.channel.send('Le deuxième channel n\'existe pas !');
                            errors++;
                        } else if (!secondchannel.nsfw) {
                            msg.channel.send('Le deuxième channel doit être NSFW');
                            errors++;
                        }
                        if (errors === 0) {
                            serversettings.servers[serverid].channels[firstchannelid] = secondchannelid;
                            writeSettings(serversettings);
                            msg.channel.send('Les images NSFW postés dans #' + firstchannel.name + ' seront maintenant redirigés vers #' + secondchannel.name);
                        }
                    } else {
                        msg.channel.send('Cette commande est réservée aux administrateurs.');
                    }
                    break;
                default:
                    msg.channel.send('Commande non reconnue, tapez ' + prefix + 'nhelp afin de consulter les commandes disponibles');
                    break;
            }
        }
    }
});

function checkDefaultSettings (serverid) {
    if (serversettings.servers[serverid] === undefined) {
        serversettings.servers[serverid] = serversettings.servers.default;
        writeSettings(serversettings);
    }
}

function writeSettings (file) {
    fs.writeFile(filename, JSON.stringify(file, null, 2), (err) => {
        if (err) {
            console.log(err);
        }
    });
}

function getnsfwChannel (serverid, channelid) {
    if (serversettings.servers[serverid] !== undefined) {
        if (serversettings.servers[serverid].channels[channelid] !== undefined) {
            return serversettings.servers[serverid].channels[channelid];
        }
    }
    return false;
}

bot.login(token).then(() => {
    console.log('-----------------------------------------------------\n-------------------'+ bot.user.username +' is now Online!--------------\n-----------------------------------------------------');
});
