FROM postgres:16-alpine

RUN mkdir -p /backups

COPY backup.sh /usr/local/bin/backup.sh
COPY restore.sh /usr/local/bin/restore.sh
COPY crontab /etc/crontabs/root

RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh

CMD ["sh", "-c", "export -p > /etc/backup.env && exec crond -f -l 2"]