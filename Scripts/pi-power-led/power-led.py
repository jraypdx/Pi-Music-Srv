#!/usr/bin/env python


import RPi.GPIO as GPIO

# simple program to turn on an LED when the PI is ready for use
# the LED will turn off automatically when the PI shuts down or is rebooted
GPIO.setmode(GPIO.BCM)
GPIO.setup(25, GPIO.OUT)
GPIO.output(25, GPIO.HIGH)


