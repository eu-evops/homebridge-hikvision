/*

import path from 'path';
import axios from 'axios';

import storage from 'node-persist';

import { Accessory, AccessoryEventTypes, Bridge, Categories, uuid, VoidCallback, Service } from '../';
import * as hap from '../';
import * as Api from './lib/api';
import { Characteristic } from '../lib/Characteristic';
import * as UUID from '../lib/util/uuid';

import xml2js from 'xml2js';
import highland from 'highland';

import { FFMPEG } from 'homebridge-camera-ffmpeg/ffmpeg';


console.log("HAP-NodeJS starting...");

// Initialize our storage system
storage.initSync();

// Start by creating our Bridge which will host all loaded Accessories
const bridge = new Bridge('HikVision NVR', uuid.generate("HikVision NVR"));

// Listen for bridge identification event
bridge.on(AccessoryEventTypes.IDENTIFY, (paired: boolean, callback: VoidCallback) => {
  console.log("Node Bridge identify");
  callback(); // success
});

const apiConfig: Api.HikVisionNvrApiConfiguration = require('./config.json');

const api = new Api.Api(apiConfig);
api.getSystemInfo()
  .then(async systemInformation => {
    console.log(`Received system information: ${JSON.stringify(systemInformation, null, 2)}`)
    const deviceInfo = systemInformation.DeviceInfo;

    bridge.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Manufacturer, "HikVision")
      .setCharacteristic(Characteristic.SerialNumber, deviceInfo.serialNumber)
      .setCharacteristic(Characteristic.Model, deviceInfo.model)
      .setCharacteristic(Characteristic.FirmwareRevision, deviceInfo.firmwareVersion);

    const xmlParser = new xml2js.Parser({
      explicitArray: false,
    });


      // EventNotificationAlert: {
      //   '$': { version: '2.0', xmlns: 'http://www.isapi.org/ver20/XMLSchema' },
      //   ipAddress: '10.0.1.186',
      //   portNo: '80',
      //   protocolType: 'HTTP',
      //   macAddress: 'f8:4d:fc:f8:ef:1c',
      //   dynChannelID: '1',
      //   channelID: '1',
      //   dateTime: '2020-02-19T18:44:4400:00',
      //   activePostCount: '1',
      //   eventType: 'fielddetection',
      //   eventState: 'active',
      //   eventDescription: 'fielddetection alarm',
      //   channelName: 'Front door',
      //   DetectionRegionList: { DetectionRegionEntry: [Object] }
      // }

const processHikVisionEvent = function (event: any) {
  switch (event.EventNotificationAlert.eventType) {
    case 'videoloss':
      console.log("videoloss, nothing to do...");
      break;
    case 'fielddetection':
    case 'shelteralarm':
    case 'VMD':
      const motionDetected = event.EventNotificationAlert.eventState === 'active';
      const channelId = event.EventNotificationAlert.channelID;
      const cameraUuid = UUID.generate(channelId);

      const camera = bridge.bridgedAccessories.find(a => a.UUID === cameraUuid);
      if (!camera) {
        return console.log('Could not find camera for event', event);
      }

      console.log("Motion detected on camera, triggering motion", camera);
      camera.getService(Service.MotionSensor)
        ?.setCharacteristic(Characteristic.MotionDetected, motionDetected);

      setTimeout(() => {
        console.log("Disabling motion detection on camera", camera);
        camera.getService(Service.MotionSensor)
          ?.setCharacteristic(Characteristic.MotionDetected, !motionDetected);
      }, 10000);

    default:
      console.log('event', event);
  }
}

const url = `/ISAPI/Event/notification/alertStream`

api.get(url, {
  responseType: 'stream',
  headers: {}
}).then(response => {
  console.log(response);
  highland(response!.data)
    .map((chunk: any) => chunk.toString('utf8'))
    .filter(text => text.match(/<\?xml/))
    .map(text => text.replace(/[\s\S]*<\?xml/gmi, '<?xml'))
    .map(xmlText => xmlParser.parseStringPromise(xmlText))
    .each(promise => promise.then(processHikVisionEvent));
});

const cameras = await api.getCameras();
cameras
  .map(function (channel: { id: string; name: string }) {
    const uuid = UUID.generate(channel.id);
    const camera = new Accessory(channel.name, uuid);
    camera.category = Categories.CAMERA;

    // fmpeg \
    //   -rtsp_transport tcp \
    //   -re \
    //   -i rtsp://admin:Ma37dXy2019!@10.0.1.186/Streaming/Channels/201 \
    //   -map 0:0 \
    //   -vcodec libx265 \
    //   -pix_fmt yuv420p \
    //   -r 30 \
    //   -f rawvideo \
    //   -tune zerolatency \
    //   -b:v 299k \
    //   -bufsize 299k \
    //   -maxrate 299k \
    //   -payload_type 99 \
    //   -ssrc 9224111 \
    //   -f rtp \
    //   -srtp_out_suite AES_CM_128_HMAC_SHA1_80 \
    //   -srtp_out_params Tr6vAbfPrnz3qNRxe644XrPn86OALKDkHGEP6pGl \
    //   srtp://10.0.1.114:50960?rtcpport=50960&localrtcpport=50960&pkt_size=1316 \
    //   -loglevel debug

    const cameraSource = new FFMPEG(hap, {
      name: channel.name,
      videoConfig: {
        source: `-rtsp_transport tcp -re -i rtsp://${apiConfig.username}:${apiConfig.password}@${apiConfig.host}/Streaming/Channels/${channel.id}01`,
        stillImageSource: `-i http://${apiConfig.username}:${apiConfig.password}@${apiConfig.host}/ISAPI/Streaming/channels/${channel.id}01/picture?videoResolutionWidth=720`,
        maxFPS: 30,
        maxBitrate: 1800,
        maxWidth: 1920,
        vcodec: "libx264",
        audio: true,
        debug: false
      }
    }, console.log, 'ffmpeg', '');
    camera.configureCameraSource(cameraSource);

    const motionService = new Service.MotionSensor(channel.name, "");
    camera.addService(motionService);

    camera.getService(Service.AccessoryInformation)!
      .setCharacteristic(Characteristic.Name, channel.name);

    return camera;
  }).forEach(function (camera: Accessory) {
    console.log("Adding camera", camera);
    bridge.addBridgedAccessory(camera);
  });

// Publish the Bridge on the local network.
bridge.publish({
  // username: deviceInfo.macAddress,
  username: 'CC:22:3D:E3:CE:F8',
  port: 51827,
  pincode: "031-45-154",
  category: Categories.BRIDGE
});
  })
  .catch (e => {
  console.log("Could not log in to HikVision");
  console.log(e);
});;



var signals = { 'SIGINT': 2, 'SIGTERM': 15 } as Record<string, number>;
Object.keys(signals).forEach((signal: any) => {
  process.on(signal, function () {
    bridge.unpublish();
    setTimeout(function () {
      process.exit(128 + signals[signal]);
    }, 1000)
  });
});


*/