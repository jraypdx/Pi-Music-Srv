#!/usr/bin/env python3

import RPi.GPIO as GPIO
import time
import alsaaudio

# debugging - sudo/root doesn't seem to be able to see the mixers
#print (alsaaudio.cards())
#print (alsaaudio.mixers())

m = alsaaudio.Mixer()
vol = m.getvolume()[0]
is_mute = m.getmute()[0]
print (vol)

GPIO.setmode(GPIO.BCM)

# Volume buttons
vol_up_pin = 14  # GPIO pin 14 = raspi3b pin 8 I believe
vol_dn_pin = 4  # GPIO pin 4 = raspi3b pin 7 I believe
GPIO.setup(vol_up_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
GPIO.setup(vol_dn_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)

# Volume LEDs | Red = full (90% vol), Yellow = 70%+, Green = 40%+, Blue = 0% or muted
red_pin = 24  # GPIO #s, not raspi pin #s
yellow_pin = 17
green_pin = 27
blue_pin = 22
GPIO.setup(red_pin, GPIO.OUT)
GPIO.setup(yellow_pin, GPIO.OUT)
GPIO.setup(green_pin, GPIO.OUT)
GPIO.setup(blue_pin, GPIO.OUT)

def toggle_mute():
    global is_mute
    m.setmute(1 - is_mute)
    is_mute = m.getmute()[0]
    if is_mute:
        print('Muted')
        GPIO.output(blue_pin, 1)
    else:
        print('Un-muted')
        GPIO.output(blue_pin, 0)

if (vol > 90):  # limit the max volume to 90 to prevent any distortion
    m.setvolume(90)
elif (vol == 0):  # if pi is booted up with volume at 0, toggle mute so that the blue mute LED turns on
    toggle_mute()

# init volume LEDs
if (vol >= 40):
    GPIO.output(green_pin, 1)
if (vol >= 70):
    GPIO.output(yellow_pin, 1)
if (vol == 90):
    GPIO.output(red_pin, 1)

while True:
    vu = not GPIO.input(vol_up_pin)
    vd = not GPIO.input(vol_dn_pin)
    if vu and not vd:
        if is_mute:
            toggle_mute()
        if vol < 90:  # limit the max volume to 90 to prevent any distortion that may occur
            vol += 5
            m.setvolume(vol)
            vol = m.getvolume()[0]
            if (vol == 90):  # on the way up turn on the volume LEDs
                GPIO.output(red_pin, 1)
            elif(vol == 70):
                GPIO.output(yellow_pin, 1)
            elif(vol == 40):
                GPIO.output(green_pin, 1)
        print ('Volume up Pressed', str(vol))
    elif vd and not vu:
        if is_mute:
            toggle_mute()
        if vol > 5:
            vol -= 5
            m.setvolume(vol)
            vol = m.getvolume()[0]
            if (vol == 85):  # on the way down turn off the volume LEDs
                GPIO.output(red_pin, 0)
            elif (vol == 65):
                GPIO.output(yellow_pin, 0)
            elif (vol == 35):
                GPIO.output(green_pin, 0)
        else:  # if volume is at 5% and the vol_down button is pressed, it goes to 0% and mutes so that the blue LED turns on
            vol = 0
            m.setvolume(0)
            if (not is_mute):
                toggle_mute()
        print ('Volume down Pressed', str(vol))
    elif vd and vu:
        if (is_mute and vol == 0):
            print ('Volume can not be unmuted while at 0%')
        else:
            toggle_mute()
        time.sleep(0.5)

    time.sleep(0.2)
