import dotenv from "dotenv";
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("messageCreate", async (message) => {
  try {
    const { author, content, guild, channel } = message;

    if (author.bot) return;

    if (!guild) return;

    if (
      ![
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.GuildText,
      ].includes(channel.type)
    )
      return; // only threds (forum + text) and text channel

    // excludef forum threads too
    if (
      channel.type === ChannelType.PublicThread &&
      channel.parent.type === ChannelType.GuildForum
    )
      return;

    const postRegex =
      /(https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]+\/status\/\d+)/i;

    const match = content.match(postRegex);

    if (!match) return;

    // check perms

    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageWebhooks))
      return;

    const fullLink = match[0];

    const fxLink = fullLink
      .replace("twitter.com", "api.fxtwitter.com")
      .replace("x.com", "api.fxtwitter.com");

    const res = await fetch(fxLink);

    const data = await res.json();

    if (!res.ok) {
      console.log(res);
      console.log(data);
      throw new Error(`${res.statusText} (${res.status})`);
    }

    await sendTweetToDiscord(data, message);
  } catch (err) {
    console.error(err);
  }
});

async function sendTweetToDiscord(data, message) {
  const { media, url } = data.tweet;

  const { author, channel } = message;

  const { webhook, isThread } = await getOrCreateWebhook(channel);

  // Prepare attachments (buffers)
  const attachments = [];

  if (!media?.photos?.length) return;

  for (const [i, photo] of media.photos.entries()) {
    const res = await fetch(photo.url);
    const buffer = Buffer.from(await res.arrayBuffer());

    attachments.push({
      attachment: buffer,
      name: `tweet_image_${i + 1}.webp`,
    });
  }

  await webhook.send({
    username: `${author.username}`,
    avatarURL: author.displayAvatarURL(),
    content: `${url}`,
    files: attachments,
    flags: MessageFlags.SuppressEmbeds,
    ...(isThread && { threadId: channel.id }),
  });

  await message.delete().catch(console.error);
}

/**
 *
 * @param {import("discord.js").GuildTextChannelType |  import("discord.js").PublicThreadChannel<false> | import("discord.js").PrivateThreadChannel} ch
 * @returns
 */
async function getOrCreateWebhook(ch) {
  let channel = ch;
  let isThread;

  if (ch.parent?.type === ChannelType.GuildText) {
    channel = ch.parent;
    isThread = true;
  }

  const webhooks = await channel.fetchWebhooks();

  let webhook = webhooks.find((wh) => wh.owner?.id === client.user.id);

  if (!webhook) {
    webhook = await channel.createWebhook({
      name: "Tweet Relay",
      avatar: "https://abs.twimg.com/icons/apple-touch-icon-192x192.png",
    });
  }

  return { webhook, isThread };
}
client.login(process.env.TOKEN);
