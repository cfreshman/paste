# paste

real-time synced text editor for [yxorp](https://yxorp.app) users

## install

```bash
git clone <this-repo> paste
cd paste
npm install

# allow port through firewall
sudo ufw allow 8766

# run server
PORT=8766 node server.js
```

configure in [yxorp](https://yxorp.app): `paste.yourdomain.com → localhost:8766`

## what you get

- single shared text area
- synced in real-time across all open devices
- password protected
- persisted to disk
- WebSocket based

## security

on first visit, you'll be prompted to create a password. it's hashed (sha256) and stored in `data/password.txt`.

**reset password:** delete `data/password.txt` and restart the server.

## optional: keep it running

```bash
npm install -g pm2
PORT=8766 pm2 start server.js --name paste
pm2 save
```

## configuration

```bash
PORT=8766 node server.js                # custom port (default: 8766)
DATA_DIR=~/paste node server.js         # custom data location (default: ./data)
```

---

real-time collaborative notepad. one file. works forever.

