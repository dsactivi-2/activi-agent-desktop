export const APP_ENDPOINTS = {
  localApiUrl: "http://127.0.0.1:8642",
  remoteApiUrlPlaceholder: "http://<agent-host>:8642",
  sshHostPlaceholder: "agent-host.example.com",
  sshUserPlaceholder: "user",
  sshKeyPathPlaceholder: "~/.ssh/id_rsa",
  defaultSshPort: "22",
  defaultAgentPort: "8642",
  defaultSshTunnelPort: 18642,
  proxyPlaceholder: "socks5://<proxy-host>:1080 or http://<proxy-host>:8080",
  officeWebsocketUrl: "ws://localhost:18789",
} as const;

export const APP_LINKS = {
  communityUrl: "",
  officeRepoUrl: "https://github.com/dsactivi-2/office-kombiteks",
} as const;
