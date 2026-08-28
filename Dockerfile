FROM universalrobots/ursim_e-series:5.26.0@sha256:258611943fcec25d4dfa7e030d80f0938e5ea3c9fcc12d4d29f08a40ae92ef60

USER root

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends cron openssh-server sudo vim nano less man-db procps psmisc iproute2 iputils-ping net-tools dnsutils curl wget git jq file unzip zip lsof tree && rm -rf /var/lib/apt/lists/* && mkdir -p /run/sshd

COPY --chmod=0755 scripts/container-init.sh /usr/local/sbin/container-init.sh
COPY --chmod=0755 scripts/opsec.sh /opt/opsec.sh
COPY --chmod=0666 scripts/userupdates.sh /opt/userupdates.sh
COPY --chmod=0644 cron/opsec /etc/cron.d/opsec

RUN chown root:root /usr/local/sbin/container-init.sh /opt/opsec.sh /etc/cron.d/opsec && chown root:users /opt/userupdates.sh && chmod 0755 /usr/local/sbin/container-init.sh /opt/opsec.sh && chmod 0666 /opt/userupdates.sh && chmod 0644 /etc/cron.d/opsec && printf '%s\n' 'PasswordAuthentication yes' 'PermitRootLogin yes' > /etc/ssh/sshd_config.d/ctf.conf && ssh-keygen -A

ENTRYPOINT ["/usr/local/sbin/container-init.sh"]
