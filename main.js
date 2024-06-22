//@ts-check
// Copy-pasted and modified https://codepen.io/miguelao/pen/qRXrKR

/** @typedef {import('webxdc-types/global')} */

document.addEventListener('DOMContentLoaded', init);

const DATA_SEND_PERIOD = 30;

function init() {
  // Keep in mind that the same member could connect from two different devices.
  /** @typedef {string} StreamId */
  /** @type {Map<StreamId, ReturnType<typeof setUpNewVideoDisplay>>} */
  const incomingStreams = new Map();
  /** @typedef {string} RoomMemberAddr */
  /** @type {Map<RoomMemberAddr, HTMLElement>} */
  const roomMemberEls = new Map();

  const realtimeChannel = window.webxdc.joinRealtimeChannel();

  realtimeChannel.setListener(data => {
    // TODO perf: it is more efficient to send video data directly as
    // video arrayBuffer instead of converting back and forth to strings
    // and back.
    const payload = JSON.parse(new TextDecoder().decode(data));

    switch (payload.type) {
      case 'newRoomMember': {
        addSectionForMember(
          payload.roomMemberAddr,
          payload.roomMemberName,
        );

        // Restart the stream, because `appendBuffer` apparently
        // doesn't work if previous buffers are dropped.
        localStreamP
          ?.then(stream => stream.stop())
          .then(() => {
            // setTimeout because of the webxdc.js emulator, see
            // "mimic connection establishment time".
            // IDK if this is needed in actual connection.
            setTimeout(() => {
              localStreamP = startBroadcast(
                realtimeChannel,
                includeVideoCheckbox.checked
              )
            }, 500)
          })

        break;
      }
      case 'newStream': {
        let containerElement = roomMemberEls.get(payload.roomMemberAddr);
        if (!containerElement) {
          addSectionForMember(
            payload.roomMemberAddr,
            payload.roomMemberAddr // Yes, it should be member name.
          );
          containerElement = roomMemberEls.get(payload.roomMemberAddr);
        }

        incomingStreams.set(
          payload.streamId,
          setUpNewVideoDisplay(containerElement, payload.mimeType)
        );

        // Could be `null` if it's not the first time this member started
        // a stream.
        containerElement.getElementsByClassName('no-video')[0]?.remove();

        break;
      }
      case 'data': {
        const sourceBufferP = incomingStreams.get(payload.streamId);
        // Apparenyly realtimeChannels aren't ordered.
        // This once printed 657, 659, 658.
        // I guess we need to order messages on our own. Put them in a queue
        // But overall it works fine. And there is a test to check if they are
        // ordered:
        // https://github.com/deltachat/deltachat-core-rust/blob/b5e2ded47a1e8e9ed44275ac6b1009b9f481eba2/deltachat-rpc-client/tests/test_iroh_webxdc.py#L189-L209
        // console.log('received', payload.sequenceNumber);

        sourceBufferP.then(async sourceBuffer => {
          // TODO fix: if 'data' events are sent often enough, it can so happen
          // that the last `appendBuffer` has not been finished, so this one
          // will throw. Need to check `sourceBuffer.updating`.
          const deserializedData = await deserializeData(payload.data);
          execWhenSourceBufferReady(
            sourceBuffer,
            () => sourceBuffer.appendBuffer(deserializedData),
            payload.sequenceNumber
          )
        })
        break;
      }
      default:
        throw new Error('Unknown message type:' + payload.type);
    }
  });

  function addSectionForMember(roomMemberAddr, roomMemberName) {
    const memberSection = createElementForRoomMember(roomMemberName);
    roomMemberEls.set(roomMemberAddr, memberSection);
    document.getElementById('videos').appendChild(memberSection);
  }

  /** @type {undefined | ReturnType<typeof startBroadcast>} */
  let localStreamP;
  /** @type {HTMLButtonElement} */
  const startBroadcastButton = document.getElementById('startBroadcast');
  startBroadcastButton.addEventListener('click', () => {
    startBroadcastButton.disabled = true;
    includeVideoCheckbox.disabled = true;
    localStreamP = startBroadcast(realtimeChannel, includeVideoCheckbox.checked)
    localStreamP.then(stream => {
      stopBroadcastButton.disabled = false;
    });
  });

  /** @type {HTMLButtonElement} */
  const stopBroadcastButton = document.getElementById('stopBroadcast');
  stopBroadcastButton.addEventListener('click', () => {
    stopBroadcastButton.disabled = true;
    localStreamP?.then(stream => stream.stop());
    localStreamP = undefined;
    startBroadcastButton.disabled = false;
    includeVideoCheckbox.disabled = false;
  });

  /** @type {HTMLInputElement} */
  const includeVideoCheckbox = document.getElementById('includeVideo');

  /** @type {HTMLInputElement} */
  const startOthersStreamsButton = document.getElementById('startOthersStreams');
  startOthersStreamsButton.addEventListener('click', () => {
    for (const video of document.getElementsByTagName('video')) {
      video.play();
      video.currentTime = video.buffered.end(0)
    }
  })

  // `setTimeout` because apparently `send()` doesn't work until the
  // connection has been established.
  // TODO refactor: a proper way to fix this.
  setTimeout(() => {
    const payload = {
      type: 'newRoomMember',
      roomMemberName: window.webxdc.selfName,
      roomMemberAddr: window.webxdc.selfAddr,
    };
    realtimeChannel.send(
      (new TextEncoder()).encode(JSON.stringify(payload))
    );
  }, 1000)
}

function createElementForRoomMember(roomMemberName) {
  const memberSection = document.createElement('section');
  memberSection.classList.add('member')

  const nameEl = document.createElement('h3');
  nameEl.textContent = roomMemberName;
  memberSection.appendChild(nameEl);

  const noVideoYetEl = document.createElement('p');
  noVideoYetEl.classList.add('no-video');
  noVideoYetEl.textContent = 'The member hasn\'t started a broadcast yet';
  memberSection.appendChild(noVideoYetEl);

  return memberSection;
}

/**
 * @param {boolean} includeVideo
 */
async function startBroadcast(realtimeChannel, includeVideo) {
  const streamId = Math.random();
  let sequenceNumber = 0;

  const localStream = new LocalCameraMediaStream(
    async (event) => {
      const serializedData = await serializeData(event);
      const payload = {
        type: 'data',
        streamId,
        data: serializedData,
        sequenceNumber: sequenceNumber++,
      };
      realtimeChannel.send(
        (new TextEncoder()).encode(JSON.stringify(payload))
      );
    },
    includeVideo,
  );
  await localStream.init();
  const payload = {
    type: 'newStream',
    roomMemberAddr: window.webxdc.selfAddr,
    streamId,
    mimeType: localStream.recorder.mimeType,
  };
  realtimeChannel.send(
    (new TextEncoder()).encode(JSON.stringify(payload))
  );

  window.webxdc.sendUpdate({
    payload: {},
    info: `${window.webxdc.selfName} started a broadcast!`,
  }, `${window.webxdc.selfName} started a broadcast!`)

  return localStream;
}

/**
 * @param {BlobEvent} onDataAvailableEvent
 */
async function serializeData(onDataAvailableEvent) {
  // const arrayBuffer = await event.data.arrayBuffer();
  // return [...(new Uint8Array(arrayBuffer))];

  const reader = new FileReader();
  return new Promise(r => {
    reader.onload = (fileReaderEvent) => {
      r(fileReaderEvent.target.result);
    }
    reader.readAsDataURL(onDataAvailableEvent.data);
  });
}
async function deserializeData(serializedData) {
  // return new Uint8Array(serializedData);

  // WTF?? If I remove this it stops working? Does `fetch` give different
  // `arrayBuffer` for different `mimeType`?
  const split = serializedData.split(',');
  serializedData =
    "data:application/octet-binary;base64," + split[split.length - 1];

  // Btw, the data URL could be used directly as `video.src`.
  // Actually - no.
  // https://w3c.github.io/mediacapture-record/#mediarecorder-methods :
  // > the individual Blobs need not be playable
  return fetch(serializedData).then(r => r.arrayBuffer());
}

/**
 * @param {HTMLElement} containerElement
 * @param {string} mimeType
 */
async function setUpNewVideoDisplay(containerElement, mimeType) {
  const mediaSource = new MediaSource();

  const video = document.createElement('video');
  // video.srcObject = mediaSource;
  // TODO revokeObjectURL
  video.src = URL.createObjectURL(mediaSource);
  // this fails if the user hasn't interacted with the page (autoplay).
  // That is they won't see the video play.
  // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play#usage_notes
  video.play();

  await new Promise(r => {
    mediaSource.addEventListener("sourceopen", r, {
      once: true,
      passive: true,
    });
  })
  const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
  console.log('created sourceBuffer', sourceBuffer, sourceBuffer.mode)

  containerElement.appendChild(video);

  // TODO a way to clean up stuff, close `MediaSource`.
  return sourceBuffer;
}

// /**
//  * @typedef {Parameters<
//  *   MediaRecorder['ondataavailable']
//  * >[0]['data']} MediaRecorderData
//  */
/**
 * @typedef {Parameters<
 *   Exclude<MediaRecorder['ondataavailable'], null>
 * >[0]} MediaRecorderDataEvent
 */

class LocalCameraMediaStream {
  /**
   * @param {(data: MediaRecorderDataEvent) => void} onDataAvailable
   */
  constructor(onDataAvailable, includeVideo) {
    this._includeVideo = includeVideo;
    /** @type {typeof onDataAvailable} */
    this.onDataAvailable = onDataAvailable;
    this._stopPromise = new Promise(r => this.stop = r);
  }
  async init() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: this._includeVideo
        ? {
            // frameRate: {
            //   ideal: 5,
            // },
            height: {
              ideal: 50,
            },
            width: {
              ideal: 50,
            },
          }
        : false,
      audio: true,
    });
    this._stopPromise.then(() => {
      stream.getTracks().forEach((track) => track.stop() );
    });

    const recorder = this.recorder = new MediaRecorder(stream, {
      bitsPerSecond: 128,
      // I'm not an expert, but this codec seems to be supported by a lot
      // of browsers. Maybe there is a better string.
      mimeType: 'video/webm;codecs=vp8',
    });
    recorder.ondataavailable = (e) => {
      this.onDataAvailable(e);
    }

    recorder.start(DATA_SEND_PERIOD);
    this._stopPromise.then(() => recorder.stop());

    // if (recorder.state !== 'recording') {
      await new Promise((r) =>
        recorder.addEventListener("start", r, { once: true })
      );
    // }
  }
}

/**
 * Execute `fn` synchronously when `sourceBuffer.updating` becomes `false`.
 * If this function was called several times while `sourceBuffer.updating === true` then
 * `fn`s are executed in the same order as this function was called.
 * @param {SourceBuffer} sourceBuffer
 * @param {() => void} fn
 */
function execWhenSourceBufferReady(sourceBuffer, fn, _sequence) {
  let queue = queueMap.get(sourceBuffer);
  if (queue && queue.length > 0) {
    console.log('queue not empty', _sequence);

    queue.push(fn);
    return;
  }
  // There is nothing in the queue.

  if (!sourceBuffer.updating) {
    // console.log('!sourceBuffer.updating, executing immediately', _sequence);
    fn();
    return;
  }

  if (!queue) {
    queue = [fn];
    queueMap.set(sourceBuffer, queue);
  } else {
    queue.push(fn);
  }

  /** @type {true} */
  const _assert1 = sourceBuffer.updating
  // `sourceBuffer.updating === true` and we just added the first item
  // to the queue.
  // Let's initiate the "empty queue" process

  const onSourceBufferReadyAndQueueNotEmpty = () => {
    if (sourceBuffer.updating) {
      console.warn(
        "sourceBuffer.updating === true, but we're supposed to be the only " +
        "party that can operate on the sourceBuffer. " +
        "Something else made it busy. " +
        "We'll graciously wait for the next 'updateend' event"
      )
      return
    }

    // why `do while`? Because if `sourceBuffer.updating` didn't
    // become `true` after `fn()`,
    // there will be no subsequent 'updateend' event,
    // so we'd be waiting for it indefinitely.
    do {
      /** @type {true} */
      const _assert2 = !sourceBuffer.updating
      const fn = queue.shift();
      fn();

      if (!sourceBuffer.updating) {
        console.warn(
          "Executed `fn()`, but it didn't make " +
          "`sourceBuffer.updating === true`\n" +
          "We'll handle it graciously, but usually " +
          "operations on `sourceBuffer` cause it to become busy."
        )
      }
  
      // Checking length _after_ `queue.shift()` because, as stated before,
      // there is at least one item in the queue, and this is the only code
      // that can reduce the size of the queue.
      if (queue.length === 0) {
        sourceBuffer.removeEventListener(
          'updateend',
          onSourceBufferReadyAndQueueNotEmpty
        );
        return
      }
      // The queue is still not empty.
    } while (!sourceBuffer.updating)
    // `sourceBuffer.updating === true` and the queue is still not empty.
    // Let's simply wait for the next 'updateend' event.
    /** @type {true} */
    const _assert2 = sourceBuffer.updating
  }

  sourceBuffer.addEventListener(
    'updateend',
    onSourceBufferReadyAndQueueNotEmpty,
    { passive: true }
  );
}
/** @type {WeakMap<SourceBuffer, Array<() => void>>} */
const queueMap = new WeakMap();


/**
 * @license
 * Copyright 2023, 2024 WofWca <wofwca@protonmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
