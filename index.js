// dotbrew 2025

// libraries
import { createRestAPIClient } from "masto";
import got from "got";
import {} from 'dotenv/config';
import cron from 'node-cron';

// vars
var version = "2.0"
var debug = false; // no touchie

var prod_server = process.env.PROD_SERVER;
var prod_access_token = process.env.PROD_ACCESS_TOKEN;

var debug_server = process.env.DEBUG_SERVER;
var debug_access_token = process.env.DEBUG_ACCESS_TOKEN;

var discord_logging_webhook = process.env.DISCORD_WEBHOOK;

var vncresolver_random_url = "https://computernewb.com/vncresolver/api/v1/random";
var vncresolver_screenshot_url = "https://computernewb.com/vncresolver/api/v1/screenshot";

var prod_interval = "0 * * * *";
var debug_interval = "* * * * *";

if (process.argv.includes('--debug')) {
    debug = true;
}

// internal usage vars - don't mess with
var get_retry_count = 0;
var makepost_retry_count = 0;
var max_retry_count = 3;
var retry_time = 10000;

// got options
const options = {
    timeout: {
        request: 15000,
    },
};

const client = got.extend(options);

export default client;

// logging stuff
async function log(title, content, type){
    var log_types = ["ℹ Log", "❌ Error", "⚠ Warning"];
    var log_type_colors = [0x00d5ff, 0xff0000, 0xffff00];
    try {
        await got.post(discord_logging_webhook, {
          json: {
            username: log_types[type] + " - VNC Resolver Bot",
            avatar_url: 'https://fedi.computernewb.com/system/accounts/avatars/111/786/149/810/417/197/original/281a4bbed51058c1.webp',
            embeds: [
              {
                type: 'rich',
                title: title,
                description: content,
                color: log_type_colors[type],
              }
            ]
          },
          responseType: 'json'
        });
        console.log(`Logged: TITLE: ${title} | CONTENT: ${content}`);
      } catch (error) {
        console.error('Error logging: ', error.response?.body || error.message);
      }
};

// sub-functions

function convert_date(unixTimestamp) {
  if (unixTimestamp.toString().length === 10) {
    unixTimestamp *= 1000;
  }

  const date = new Date(unixTimestamp);

  const formattedDate = date.toLocaleString('en-US', {
    month: '2-digit', 
    day: '2-digit',  
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return formattedDate;
}


function flag_emoji(country_code){
    const code = country_code
      .toUpperCase()
      .split('')
      .map(char =>  127397 + char.charCodeAt());
    return String.fromCodePoint(...code);
}

function location_parse(city, region, country){
    if (city != region){
      return `${city}, ${region}, ${country} ${flag_emoji(country)}`
    } else {
      return `${region}, ${country} ${flag_emoji(country)}`
    }
}

function null_detect(value){
if (value == null || value == undefined || String(value).trim().length === 0){
    return "N/A";
} else {
    return value;
}
}

async function check_if_image(img_id){
  var res = await got(`${vncresolver_screenshot_url}/${String(img_id)}`)
  if (res.statusCode == 200){
    return true;
  } else {return false}
}

async function get_image_lastseendate(img_url) {
  var res = await got(img_url)
  var rtrn;
  if (img_url != "https://brew.rocks/stuff/vncresolverbot_noimage.png"){
    if (res.statusCode == 200){
      var lastmodified = res.headers['last-modified'];
      if (lastmodified){
        rtrn = String(convert_date(lastmodified))
      } else {rtrn = "N/A"}
    } else {rtrn = "N/A"}
  } else {rtrn = "N/A"}

  return rtrn;
}

// masto stuff
var masto;
if (debug){
    masto = createRestAPIClient({
      url: debug_server,
      accessToken: debug_access_token,
    });
} else {
    masto = createRestAPIClient({
        url: prod_server,
        accessToken: prod_access_token,
      });
}

async function post(text, visibility){
  try {
    var status = await masto.v1.statuses.create({
      status: text,
      visibility: visibility
    });

    return "SUCCESS";
  } catch (error) {
    console.log("Post Error: " + error);
};
};

async function postimage(text, visibility, image_url, image_description){
    try {
      const remoteFile = await fetch(image_url);
      const attachment = await masto.v2.media.create({
        file: await remoteFile.blob(),
        description: image_description,
      });
      
    
      var status = await masto.v1.statuses.create({
        status: text,
        visibility: visibility,
        mediaIds: [attachment.id],
      });
  
      return "SUCCESS";
    } catch (error) {
      console.log("ImagePost Error: " + error);
      return error;
  };
};
  

// main
var interval = "* * * * *";
if (debug == true){
  interval = String(debug_interval)
} else {
  interval = String(prod_interval)
}

async function run(){
  console.log("Running GET...");
    try {
        var response = await got(vncresolver_random_url);
        

        var random_vnc = JSON.parse(response.body);
        var image_url = "https://brew.rocks/stuff/vncresolverbot_noimage.png";
        if (random_vnc.id != null){ // just to make sure it returned correctly
          if (check_if_image(random_vnc.id)) {
            image_url = `${vncresolver_screenshot_url}/${String(random_vnc.id)}`
          };

          var post_content = `IP/Port: ${random_vnc.ip_address}:${String(random_vnc.port)}
Hostname: ${null_detect(random_vnc.rdns_hostname)}
Client Name: ${null_detect(random_vnc.desktop_name)}
Location: ${location_parse(random_vnc.geo_city, random_vnc.geo_state, random_vnc.geo_country)}
ASN: ${random_vnc.asn}
VNC Password: ${null_detect(random_vnc.password)}
ID: ${String(random_vnc.id)}
Added to DB: ${convert_date(random_vnc.scanned_on)} (UTC)
Last seen: ${await get_image_lastseendate(image_url)} (UTC)
https://computernewb.com/vncresolver/browse#id/${String(random_vnc.id)}`


          console.log("Posting...\n" + post_content)
          var postresponse = await postimage(post_content, "unlisted", image_url, `${String(null_detect(random_vnc.width))}x${String(null_detect(random_vnc.height))} screenshot of VNC Resolver ID ${String(random_vnc.id)}`)
          if (postresponse != "SUCCESS"){
            if (makepost_retry_count >= max_retry_count){
              log("Making a post has failed.", postresponse + `\n\nMax retries. Retrying in an hour.`, 1);
            } else {
              makepost_retry_count = makepost_retry_count + 1
              log("Making a post has failed.", postresponse + `\n\nRetrying...(${String(makepost_retry_count)}/${String(max_retry_count)})`, 1);
              setTimeout(run, retry_time);
            }
          };
        };
    } catch (error) {
      console.log("GET Error: " + error);
        if (get_retry_count >= max_retry_count){
          log("A GET Request has failed.", error + `\n\nMax retries. Making announcement and retrying in an hour.`, 1);
          postimage("***AUTOMATED POST***\n\nSorry! We're currently experiencing technical difficulties. We're aware of the issue, and if applicable, we'll post an update regarding this issue. Thanks!"
            , "unlisted", "https://brew.rocks/stuff/vnc_errorscreen_2.png", `SMPTE color bars with text reading "TECHNICAL DIFFICULTIES, we're working on it!", dizzy brew in bottom right`);
        } else {
          get_retry_count = get_retry_count + 1;
          log("A GET Request has failed.", error + `\n\nRetrying...(${String(get_retry_count)}/${String(max_retry_count)})`, 1);
          setTimeout(run, retry_time);
        }
    }
};


console.log(`VNC Resolver Bot v${version} initializing...`)
if (debug == true){
  console.log("DEBUG MODE");
}
log("Bot has started.", "The bot has initialized and started.", 0);
cron.schedule(interval, () => {
  run();
});
