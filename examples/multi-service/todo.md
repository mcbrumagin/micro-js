Create a local multi-container deployment
Create a minikube deployment
Create a kubernetes cd/ci server
  - listens for repo and config changes
  - expose vi
Create a micro-js proxy server
  - exposes all registered microservices through a single location (domain:port)
  - subscribes to services
  - call with a header or path indicating your service name

Create contacam video notifier
Instead of using contacam emailer which is dumb to setup and probably won't notify my shitty phone, use twilio
Trigger text any time a new video file is added
Trigger call any time a certain number of video files are created over the last n minutes
Trigger call if the feed dies?
Call phone and broadcast audio through blue mic/speakers?
May also be badass to write my own security camera software
- Use some motion capture library
- Train separate model on a center-of-weight of lighting in the image
  - If a large object is present, the center of weight of light will be distorted
  - The higher the difference, the more certainty that a foreign object is present
- Filter out color for easier model training
- Filter for focussed images
- Test filtered images for presence of a person
- Training:
  - Use video of you moving around
  - Control is a video of nothing moving
  - Train separate models to identify false-positives:
    - Cats
    - Refocusing
    - Changes in light

Nonprofit idea?
Give out cell phones with basic plans to homeless/unemployed people
prioritize those who have no reliable public internet access
prioritize minorities to explicitly compensate for statistically biased policing (that is, the statistic are naturally biased because police falsely correlate race with crime; when in fact, poverty is a much better correlation model)
So since one of the main causes of crime is poverty, the charity aims to eradicate poverty through strategic empowerment of those looking for work