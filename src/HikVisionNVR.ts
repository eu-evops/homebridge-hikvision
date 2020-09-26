import * as hapNodeJs from 'hap-nodejs'
import { HikvisionApi, HikVisionNvrApiConfiguration } from './HikvisionApi';
import { HikVisionCamera } from './HikVisionCamera';
import { HIKVISION_PLATFORM_NAME, HIKVISION_PLUGIN_NAME } from '.'

import { StreamingDelegate } from 'homebridge-camera-ffmpeg/dist/streamingDelegate'
import { Logger } from 'homebridge-camera-ffmpeg/dist/logger'
import { CameraConfig } from 'homebridge-camera-ffmpeg/dist/configTypes'


export class HikVisionNVR {
  private homebridgeApi: any
  private log: any;
  config: any;
  hikVisionApi: HikvisionApi;
  cameras: HikVisionCamera[]

  constructor(
    logger: any,
    config: any,
    api: any
  ) {
    this.hikVisionApi = new HikvisionApi(<HikVisionNvrApiConfiguration>(config as unknown))
    this.homebridgeApi = api;
    this.log = logger;
    this.config = config;
    this.cameras = [];

    this.log("Initialising accessories for HikVision");

    this.homebridgeApi.on('didFinishLaunching', this.loadAccessories.bind(this));
  }


  async loadAccessories() {
    console.log("Loading accessories")

    const systemInformation = await this.hikVisionApi.getSystemInfo()
    this.log.info("Loading cameras from API")

    const self = this;
    const cameras = await this.hikVisionApi.getCameras();

    const homebridgeCameras = cameras
      .map(function (channel: { id: string; name: string, capabilities: any }) {
        const cameraConfig = {
          accessory: 'camera',
          name: channel.name,
          channelId: channel.id,
          hasAudio: !!channel.capabilities.StreamingChannel.Audio
        };


        // self.log, Object.assign(cameraConfig, self.config), self.homebridgeApi
        const cameraUUID = self.homebridgeApi.hap.uuid.generate(HIKVISION_PLUGIN_NAME + cameraConfig.name)
        const accessory = new self.homebridgeApi.platformAccessory(cameraConfig.name, cameraUUID);
        accessory.context = cameraConfig;

        // Only add new cameras that are not cached
        if (!self.cameras.find(x => x.UUID === accessory.UUID)) {
          self.configureAccessory(accessory); // abusing the configureAccessory here
          self.homebridgeApi.registerPlatformAccessories(HIKVISION_PLUGIN_NAME, HIKVISION_PLATFORM_NAME, [accessory]);
        }

        return accessory;
      });

    this.log.info("Registering cameras with homebridge");
    // this.cameras = homebridgeCameras;

    // Remove cameras that were not in previous call
    // this.cameras.forEach((accessory: PlatformAccessory) => {
    //   if (!cameras.find((x: any) => x.uuid === accessory.UUID)) {
    //     this.homebridgeApi.unregisterPlatformAccessories(HIKVISION_PLUGIN_NAME, HIKVISION_PLATFORM_NAME, [accessory]);
    //   }
    // });


    this.startMonitoring();

  }


  async configureAccessory(accessory: any) {
    this.log(`.............. Configuring accessory ${accessory.displayName}`);

    accessory.context = Object.assign(accessory.context, this.config)
    const camera =
      new HikVisionCamera(this.log, this.homebridgeApi, accessory);


    const cameraAccessoryInfo = camera.getService(this.homebridgeApi.hap.Service.AccessoryInformation);
    // cameraAccessoryInfo!.setCharacteristic(this.homebridgeApi.hap.Characteristic.Manufacturer, 'HikVision');
    // cameraAccessoryInfo!.setCharacteristic(this.homebridgeApi.hap.Characteristic.Model, systemInformation.DeviceInfo.model);
    // cameraAccessoryInfo!.setCharacteristic(this.homebridgeApi.hap.Characteristic.SerialNumber, systemInformation.DeviceInfo.serialNumber);
    // cameraAccessoryInfo!.setCharacteristic(this.homebridgeApi.hap.Characteristic.FirmwareRevision, systemInformation.DeviceInfo.firmwareVersion);

    this.cameras.push(camera);
  }


  startMonitoring() {
    const self = this;
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

          const camera = self.cameras.find(a => a.context.channelId === channelId);
          if (!camera) {
            return console.log('Could not find camera for event', event);
          }

          console.log("Motion detected on camera, triggering motion", camera.displayName, motionDetected, camera.motionDetected);

          if (motionDetected !== camera.motionDetected) {
            camera.motionDetected = motionDetected;
            const motionService = camera.getService(hapNodeJs.Service.MotionSensor);
            console.log(motionService, camera, camera.accessory)
            motionService?.setCharacteristic(hapNodeJs.Characteristic.MotionDetected, motionDetected);

            setTimeout(() => {
              console.log("Disabling motion detection on camera", camera.name);
              camera.motionDetected = !motionDetected;
              camera.getService(hapNodeJs.Service.MotionSensor)
                ?.setCharacteristic(hapNodeJs.Characteristic.MotionDetected, !motionDetected);
            }, 10000);
          }


        default:
          console.log('event', event);
      }
    }

    this.hikVisionApi.startMonitoringEvents(processHikVisionEvent);
  }


  /*
  fmpeg \
    -rtsp_transport tcp \
    -re \
    -i rtsp://admin:Ma37dXy2019!@10.0.1.186/Streaming/Channels/201 \
    -map 0:0 \
    -vcodec libx265 \
    -pix_fmt yuv420p \
    -r 30 \
    -f rawvideo \
    -tune zerolatency \
    -b:v 299k \
    -bufsize 299k \
    -maxrate 299k \
    -payload_type 99 \
    -ssrc 9224111 \
    -f rtp \
    -srtp_out_suite AES_CM_128_HMAC_SHA1_80 \
    -srtp_out_params Tr6vAbfPrnz3qNRxe644XrPn86OALKDkHGEP6pGl \
    srtp://10.0.1.114:50960?rtcpport=50960&localrtcpport=50960&pkt_size=1316 \
    -loglevel debug
  */

}
