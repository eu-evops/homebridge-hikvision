# Homebridge Hikvision plugin

\* README written from memory, please raise an issue if things are not working as expected.

Homebridge plugin that connects to your HikVision NVR and exposes your cameras in Homebridge. The plugin is heavily based on excellent [homebridge-camera-ffmpeg](https://github.com/Sunoo/homebridge-camera-ffmpeg).

This plugin will automatically discover all cameras connected to your NVR and will expose them to homebridge. You will get access to stream video (including sound) directly from your home app, will get push notification with screenshots of the motion events - this needs to be configured in HikVision NVR and additionally in Home app under home settings - you will need to enable notifications.

## Installation

In order to use this plugin, you need to install `homebridge-camera-ffmpeg` and `homebridge-hikvision` as per below:

```bash
sudo npm install -g homebridge-camera-ffmpeg @evops/homebridge-hikvision --unsafe-perm
```

## Configuration

To configure, add this to your `config.json` for homebridge under platforms node:

```json
{
  platforms: [
    {
      "platform": "Hikvision",
      "host": "nvr-host",
      "port": 443,
      "username": "admin",
      "password": "very-secure-password"
    }
  ]
}
```

At this time, these are the only configuration options available. Once you've added the platform to your config, (re)start your homebridge instance, and configure your cameras on your iPhone or iPad, iOS will prompt you for each camera in your system.