# webxdc-video-call

<!-- Yep, actual video call over actual email. -->

This is a fork of <https://github.com/WofWca/video-call-over-email>.

A [webxdc](https://webxdc.org) app for actual video calls ~~over actual email (albeit with 15-second ping (but [it may improve soon](https://github.com/deltachat/deltachat-core-rust/pull/4904)))~~ over the recently added [real-time P2P webxdc channels](https://webxdc.org/docs/spec/joinRealtimeChannel.html).

![A simplistic video call app UI](./screenshot.jpg)

This is just a prototype.

## Usage

As was said, this is a [webxdc](https://webxdc.org) app. It requires a webxdc-supporting messenger to run. Delta Chat is one such messenger.

However, as of 2024-06-21, sending audio/video won't work on unmodified versions of Delta Chat, but [this may change](https://support.delta.chat/t/allow-access-to-camera-geolocation-other-web-apis/2446?u=wofwca) in the near future.

_Receiving_ video _does_ work on regular Delta Chat,
so you can play around with the app
without having to convince your friends to modify their Delta Chat.

### Modifying Delta Chat

Below are instructions on how to modify Delta Chat. But make sure **not to launch any webxdc apps** that you don't trust on the modified version of Delta Chat as it is **insecure**. These instructions were tested on Delta Chat 1.46.1.

1. Download [Delta Chat Desktop](https://delta.chat/).
2. Find the `DeltaChat/resources/app.asar` file in the app folder.
3. Open it as a ZIP file.
4. Open the `tsc-dist/main/deltachat/webxdc.js` file inside the archive.
5. Find the line

    ```javascript
    const permission_handler = (permission) => {
    ```

    and add a line

    ```javascript
    return true; // ADDED BY ME
    ```

    right below it.
6. Save the modified app.asar file.
7. After you're done playing around with this app, make sure to remove the line you added, or simply reinstall Delta Chat.

### Running the app

1. Launch Delta Chat.
2. Build an `.xdc` file with `./create-xdc.sh`, or just [download it from the "Releases" section](https://github.com/WofWca/video-call-over-email/releases/latest/download/webxdc-video-call.xdc).
3. Send the `.xdc` file to a chat.
4. Wait for some other chat members to launch the app.
5. Press "Start sending my media"; or just wait for others to send theirs.

<!-- This comment is irrelevant for real-time channels -->
<!-- Keep in mind that video data takes a lot of space. Make sure not to waste the storage quota on your email server. The expected bitrate in this app for audio + video is ~50 MB / hour per member and ~2 MB / hour per member for just audio. -->

## Why

Because it's funny.

And it might actually become an actually useful video call app, when:

- [x] [the ratelimit](https://github.com/deltachat/deltachat-core-rust/blob/212751f173139aab3daadcd77388b3551004cabe/src/context.rs#L382) gets much better than 1 email per 10 seconds
- [ ] webxdc apps can be [allowed camera permission](https://support.delta.chat/t/allow-access-to-camera-geolocation-other-web-apis/2446?u=wofwca)
- [x] A way is found to not fill up email servers with audio/video data (maybe something like "[ephemeral webxdc messages](https://webxdc.org/docs/spec/joinRealtimeChannel.html)")

## How it works

Nope, it's not WebRTC.

1. Record ~~10~~ 0.03 seconds of your camera stream with a [`MediaRecorder`](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API).
2. Serialize the data.
3. Send it ~~over email (with [`webxdc.sendUpdate()`](https://docs.webxdc.org/spec/sendUpdate.html))~~ over a real-time P2P channel with [`realtimeChannel.send()`](https://webxdc.org/docs/spec/joinRealtimeChannel.html#realtimechannelsenddata).
4. Repeat from step 1.

When we receive data, deserialize it and display it using [Media Source Extensions API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API).

## Web demo (no email involved)

If you just want to see how the app feels, without actually using email, go to <https://wofwca.github.io/video-call-over-email/> .
