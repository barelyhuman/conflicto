FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# System packages for git clone, builds, and passwordless sudo for apt/brew-style ops.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       ca-certificates \
       curl \
       git \
       gnupg \
       sudo \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI — required for PR features at runtime (see README).
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Cloud Agent runtime user with passwordless sudo for system package management.
RUN id -u ubuntu &>/dev/null || useradd -m -s /bin/bash ubuntu \
    && usermod -aG sudo ubuntu \
    && echo "ubuntu ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu \
    && chmod 0440 /etc/sudoers.d/ubuntu

USER ubuntu
WORKDIR /home/ubuntu

# mise — installs pinned Go, Node, and pnpm from mise.toml.
RUN curl https://mise.run | sh
ENV PATH="/home/ubuntu/.local/bin:${PATH}"
