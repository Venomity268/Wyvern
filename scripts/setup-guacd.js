#!/usr/bin/env node
/**
 * (Re)start guacd with a writable HOME for FreeRDP (standard Windows / xrdp RDP).
 */
const { execSync } = require("child_process");
const path = require("path");

const NAME = process.env.GUACD_CONTAINER || "guacd";
const PORT = process.env.GUACD_PORT || "4822";
const IMAGE_TAG = process.env.GUACD_IMAGE || "wterm-guacd:1.6.0";
const DOCKERFILE = path.join(__dirname, "..", "docker", "guacd", "Dockerfile");

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

try {
  run(`docker rm -f ${NAME}`);
} catch {
  /* container may not exist */
}

run(`docker build -t ${IMAGE_TAG} -f ${DOCKERFILE} ${path.dirname(DOCKERFILE)}`);

run(
  `docker run --name ${NAME} -d -p ${PORT}:4822 -e HOME=/home/guacd ${IMAGE_TAG}`,
);

console.log(`\nguacd ready on port ${PORT} (HOME=/home/guacd, image ${IMAGE_TAG}).`);
