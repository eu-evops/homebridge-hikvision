import { HikvisionApi, HikVisionNvrApiConfiguration } from "./HikvisionApi";
import { HikVisionCamera } from "./HikVisionCamera";
import { HIKVISION_PLATFORM_NAME, HIKVISION_PLUGIN_NAME } from ".";

import { Accessory, API, PlatformAccessory } from "homebridge";

export class HikVisionNVR {
  private homebridgeApi: API;
  private log: any;
  config: any;
  hikVisionApi: HikvisionApi;
  cameras: HikVisionCamera[];

  constructor(logger: any, config: any, api: API) {
    this.hikVisionApi = new HikvisionApi(
      <HikVisionNvrApiConfiguration>(config as unknown)
    );
    this.homebridgeApi = api;
    this.log = logger;
    this.config = config;
    this.cameras = [];

    this.log("Initialising accessories for HikVision");

    this.homebridgeApi.on(
      "didFinishLaunching",
      this.loadAccessories.bind(this)
    );
  }

  async loadAccessories() {
    console.log("Loading accessories");

    const systemInformation = await this.hikVisionApi.getSystemInfo();
    this.log.info("Loading cameras from API");

    const cameras = await this.hikVisionApi.getCameras();

    cameras.map( (channel: {
      id: string;
      name: string;
      capabilities: any;
    } ) => {
      const cameraConfig = {
        accessory: "camera",
        name: channel.name,
        channelId: channel.id,
        hasAudio: !!channel.capabilities.StreamingChannel.Audio,
      };

      const cameraUUID = this.homebridgeApi.hap.uuid.generate(
        HIKVISION_PLUGIN_NAME + cameraConfig.name
      );
      const accessory : PlatformAccessory = new this.homebridgeApi.platformAccessory(
        cameraConfig.name,
        cameraUUID
      );
      accessory.context = cameraConfig;

      // Only add new cameras that are not cached
      if (!this.cameras.find((x) => x.UUID === accessory.UUID)) {
        this.configureAccessory(accessory); // abusing the configureAccessory here
        this.homebridgeApi.registerPlatformAccessories(
          HIKVISION_PLUGIN_NAME,
          HIKVISION_PLATFORM_NAME,
          [accessory]
        );
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

  async configureAccessory(accessory: PlatformAccessory) {
    this.log(`.............. Configuring accessory ${accessory.displayName}`);

    accessory.context = Object.assign(accessory.context, this.config);
    const camera = new HikVisionCamera(this.log, this.homebridgeApi, accessory);

    const cameraAccessoryInfo = camera.getService(
      this.homebridgeApi.hap.Service.AccessoryInformation
    );
    // cameraAccessoryInfo!.setCharacteristic(this.homebridgeApi.hap.Characteristic.Manufacturer, 'HikVision');
    // cameraAccessoryInfo!.setCharacteristic(this.homebridgeApi.hap.Characteristic.Model, systemInformation.DeviceInfo.model);
    // cameraAccessoryInfo!.setCharacteristic(this.homebridgeApi.hap.Characteristic.SerialNumber, systemInformation.DeviceInfo.serialNumber);
    // cameraAccessoryInfo!.setCharacteristic(this.homebridgeApi.hap.Characteristic.FirmwareRevision, systemInformation.DeviceInfo.firmwareVersion);

    this.cameras.push(camera);
  }

  private processHikVisionEvent(event: any) {
    switch (event.EventNotificationAlert.eventType) {
      case "videoloss":
        console.log("videoloss, nothing to do...");
        break;
      case "fielddetection":
      case "shelteralarm":
      case "VMD":
        const motionDetected =
          event.EventNotificationAlert.eventState === "active";
        const channelId = event.EventNotificationAlert.channelID;

        const camera = this.cameras.find(
          (a) => a.context.channelId === channelId
        );
        if (!camera) {
          return console.log("Could not find camera for event", event);
        }

        console.log(
          "Motion detected on camera, triggering motion",
          camera.displayName,
          motionDetected,
          camera.motionDetected
        );

        if (motionDetected !== camera.motionDetected) {
          camera.motionDetected = motionDetected;
          const motionService = camera.getService(
            this.homebridgeApi.hap.Service.MotionSensor
          );
          console.log(motionService, camera, camera.accessory);
          motionService?.setCharacteristic(
            this.homebridgeApi.hap.Characteristic.MotionDetected,
            motionDetected
          );

          setTimeout(() => {
            console.log("Disabling motion detection on camera", camera.displayName);
            camera.motionDetected = !motionDetected;
            camera
              .getService(this.homebridgeApi.hap.Service.MotionSensor)
              ?.setCharacteristic(
                this.homebridgeApi.hap.Characteristic.MotionDetected,
                !motionDetected
              );
          }, 10000);
        }

      default:
        console.log("event", event);
    }
  }

  startMonitoring() {
    this.hikVisionApi.startMonitoringEvents(
      this.processHikVisionEvent.bind(this)
    );
  }
}
