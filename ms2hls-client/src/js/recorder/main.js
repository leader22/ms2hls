const uuid = require('uuid/v4');
const Timemitter = require('timemitter').default;

const { serverUrl, chunkInterval } = require('./config');

const [$vLocal, $vRemote, $rStart, $rStop] = document.querySelectorAll('button');
const [$video] = document.querySelectorAll('video');

let recorder = null;
let chunkCnt = 1;
let needFinalize = false;

const liveId = uuid();
const emitter = new Timemitter();
emitter
  .every(chunkInterval / 1000, time => {
    recorder.stop();
    recorder.start();

    console.log('send chunk', time, liveId);
  });
const peer = new window.Peer('ms2hls-recorder', {
  key: '84197755-72ad-4e5a-834b-7556de52ed6b',
  // debug: 3,
});

$vLocal.onclick = onClickLocalStream;
$vRemote.onclick = onClickRemoteStream;
$rStart.onclick = onClickRecordStart;
$rStop.onclick = onClickRecordStop;

function onClickLocalStream() {
  navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  })
    .then(stream => {
      $video.srcObject = stream;
      $video.play();
      $video.srcObject.getTracks().forEach(track => console.log(track.getSettings()));

      $vLocal.disabled = true;
      $vRemote.disabled = true;
      $rStart.disabled = false;
    });
}

function onClickRemoteStream() {
  const conn = peer.call('ms2hls-reporter');

  conn.on('stream', stream => {
    $video.srcObject = stream;
    $video.play();
    $video.srcObject.getTracks().forEach(track => console.log(track.getSettings()));

    $vLocal.disabled = true;
    $vRemote.disabled = true;
    $rStart.disabled = false;
  });
}

function onClickRecordStart() {
  recorder = new MediaRecorder($video.srcObject);

  // called only once at stop(), ondataavailable -> onstop
  recorder.ondataavailable = ev => {
    const blob = new Blob([ev.data], { type: recorder.mimeType });

    const payload = new FormData();
    payload.append('webm', blob, `${chunkCnt}.webm`);

    chunkCnt++;

    fetch(`${serverUrl}/api/chunks/${liveId}`, {
      method: 'post',
      body: payload,
    });
  };

  recorder.onstop = () => {
    if (needFinalize === false) { return; }

    console.log('send last chunk', liveId);

    console.log('finalize...', liveId);
    setTimeout(() => {
      fetch(`${serverUrl}/api/finalize/${liveId}`)
        .then(() => {
          console.log(`${serverUrl}/live/${liveId}/playlist.m3u8`);
        });
    }, chunkInterval);
  };

  console.log('initialize', liveId);
  fetch(`${serverUrl}/api/initialize/${liveId}`)
    .then(() => {
      recorder.start();
      emitter.start();
    });

  $rStart.disabled = true;
  $rStop.disabled = false;
}

function onClickRecordStop() {
  needFinalize = true;

  // send last chunk manually
  recorder.stop();
  emitter.destroy();

  $rStop.disabled = true;
}
