require('dotenv').config()
const fs = require('fs');
const Discord = require('discord.js');
const isImageUrl = require('is-image-url');
const vision = require('@google-cloud/vision');
const request = require('request').defaults({ encoding: null });
const { createLogger, format, transports } = require('winston');
const client = new vision.ImageAnnotatorClient();
const bot = new Discord.Client();
const filename = './servers-settings.json';
if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, '{"servers":{}}');
}
const serversettings = require(filename);
const globalsettings = require('./global-settings.json');
const token = process.env.BOT_TOKEN;
const ratings = [
    'VERY_UNLIKELY',
    'UNLIKELY',
    'POSSIBLE',
    'LIKELY',
    'VERY_LIKELY'
];
const logger = createLogger({
    level: 'info',
    format: format.combine(
      format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      format.errors({ stack: true }),
      format.splat(),
      format.json()
    ),
    defaultMeta: { service: 'nnsfw-bot' },
    transports: [
      //
      // - Write to all logs with level `info` and below to `quick-start-combined.log`.
      // - Write all logs error (and below) to `quick-start-error.log`.
      //
      new transports.File({ filename: './logs/error.log', level: 'error' }),
      new transports.File({ filename: './logs/combined.log' })
    ]
  });

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

            const filter = (reaction, user) => reaction.emoji.name === '🔞' && !user.bot;
            const collector = msg.createReactionCollector(filter, { time: 1800000 });
            collector.on('collect', (reaction) => {
                const member = msg.guild.member(reaction.users.last());
                if (member.hasPermission('MANAGE_MESSAGES') || reaction.users.size > 3) {
                    let destinationid;
                    if (destinationid = getNsfwChannel(serverid, msg.channel.id)) {
                        destinationchannel = msg.guild.channels.get(destinationid);
                        destinationchannel.send(url).then(() => {
                            msg.reply('ce message a été jugé inapproprié et a été déplacé dans #' + destinationchannel.name).then(() => {
                                msg.delete();
                            });
                        });
                    } else {
                        msg.author.createDM().then((dm) => {
                            dm.send("L'image que tu as posté dans le salon #" + msg.channel.name + " sur le serveur \"" + msg.guild.name + "\" a été jugée inapropriée.\nVoici l'image en question : || " + url + " ||").then(() => {
                                msg.delete();
                            });
                        });
                    }
                }
            });

            if (isImageUrl(url)) {
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
                                if (destinationid = getNsfwChannel(serverid, msg.channel.id)) {
                                    destinationchannel = msg.guild.channels.get(destinationid);
                                    destinationchannel.send(url);
                                    msg.reply('cette image a été automatiquement détectée comme étant inapproprié et a été déplacé dans #' + destinationchannel.name).then(() => {
                                        msg.delete();
                                    });
                                } else {
                                    msg.author.createDM().then((dm) => {
                                        dm.send("L'image que tu as posté dans le salon #" + msg.channel.name + " sur le serveur \"" + msg.guild.name + "\" a été détectée automatiquement comme inapropriée.\nVoici l'image en question : || " + url + " ||").then(() => {
                                            msg.delete();
                                        });
                                    });
                                }
                            }
                        })
                        .catch(err => {
                            logger.error('Google API error: %s -- Message url: %s', err, msg.url, new Date());
                        });
                    }
                });
            }
        } else if (msg.content.substring(0, prefix.length) === prefix) {
            const content = msg.content.toString();
            const isAdmin = msg.guild.member(msg.author).hasPermission('MANAGE_GUILD');
            switch (content.split(' ')[0].toLowerCase()) {
                case prefix + 'help':
                    msg.author.createDM().then((dm) => {
                        dm.send({embed: globalsettings.helpmessage});
                    });
                    msg.reply('une aide vous a été envoyée par message privé.');
                    break;
                case prefix + 'sc':
                case prefix + 'setchannel':
                    if (isAdmin) {
                        const firstchannelid = content.split(' ')[1];
                        const secondchannelid = content.split(' ')[2];
                        let firstchannel;
                        let secondchannel;
                        let errors = 0;
                        if ((firstchannel = msg.guild.channels.get(firstchannelid)) === null) {
                            msg.channel.send('Le premier channel n\'existe pas !');
                            errors++;
                        }
                        if ((secondchannel = msg.guild.channels.get(secondchannelid)) === null) {
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
                case prefix + 'uc':
                case prefix + 'unsetchannel':
                    if (isAdmin) {
                        const firstchannelid = content.split(' ')[1];
                        if (!!serversettings.servers[serverid].channels[firstchannelid]) {
                            delete serversettings.servers[serverid].channels[firstchannelid];
                            writeSettings(serversettings);
                            firstchannel = msg.guild.channels.get(firstchannelid);
                            msg.channel.send('Le channel #' + firstchannel.name + ' n\'est plus associé à un channel NSFW.');
                        } else {
                            msg.channel.send('Aucune pair trouvée pour cet identifiant.');
                        }
                    } else {

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
        serversettings.servers[serverid] = globalsettings.default;
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

function getNsfwChannel (serverid, channelid) {
    if (serversettings.servers[serverid] !== undefined) {
        if (serversettings.servers[serverid].channels[channelid] !== undefined) {
            return serversettings.servers[serverid].channels[channelid];
        }
    }
    return false;
}

bot.login(token).then(() => {
    console.log('-----------------------------------------------------\n-------------------'+ bot.user.username +' is now Online!--------------\n-----------------------------------------------------');
    logger.info('%s started running', bot.user.username);
});
