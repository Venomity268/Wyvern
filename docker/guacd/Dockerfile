FROM guacamole/guacd:1.6.0

USER root
RUN mkdir -p /home/guacd/.config/freerdp \
    && chown -R guacd:guacd /home/guacd

USER guacd
ENV HOME=/home/guacd
WORKDIR /home/guacd
