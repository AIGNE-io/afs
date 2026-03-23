# @aigne/afs-cli

AFS 命令行工具 - AFS-UI 的文本投影 (reference implementation)

## 安装

```bash
npm install -g @aigne/afs-cli
# 或
pnpm add -g @aigne/afs-cli
```

## 快速开始

```bash
# 配置挂载点
afs mount add /src fs:///path/to/project/src
afs mount add /docs fs:///path/to/docs

# 列出目录
afs list /src

# 读取文件
afs read /src/index.ts

# 搜索内容
afs search /src "TODO"
```

## 配置文件

AFS CLI 使用 `.afs-config/config.toml` 配置挂载点和服务器设置。

### 配置文件位置

```
~/.afs-config/config.toml          # 用户级 (最低优先级)
<project>/.afs-config/config.toml  # 项目级
<subdir>/.afs-config/config.toml   # 子目录级 (最高优先级)
```

### 配置示例

```toml
# 本地文件系统
[[mounts]]
path = "/src"
uri = "fs:///Users/dev/project/src"
description = "项目源码"

# Git 仓库
[[mounts]]
path = "/upstream"
uri = "git:///path/to/repo?branch=main"
access_mode = "readonly"

# SQLite 数据库
[[mounts]]
path = "/db"
uri = "sqlite:///path/to/app.db"

# 远程 AFS 服务器 (带认证)
[[mounts]]
path = "/remote"
uri = "https://afs.example.com/afs"
token = "${AFS_TOKEN}"  # 使用环境变量

# HTTP 服务器配置
[serve]
host = "localhost"
port = 3000
path = "/afs"
readonly = false
cors = false
max_body_size = 10485760  # 10MB
token = "${AFS_SERVER_TOKEN}"  # 服务器认证 token
```

### 挂载配置字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `path` | 是 | 挂载路径 (如 `/src`) |
| `uri` | 是 | Provider URI (如 `fs:///path`) |
| `description` | 否 | 人类/LLM 可读描述 |
| `access_mode` | 否 | 访问模式: `readonly` 或 `readwrite` |
| `token` | 否 | HTTP Provider 认证 token (支持 `${ENV_VAR}`) |
| `auth` | 否 | 认证字符串 (支持 `${ENV_VAR}`) |
| `namespace` | 否 | 命名空间 (用于隔离不同环境) |
| `options` | 否 | Provider 特定选项 |

## 命令

### 文件操作

| 命令 | 功能 |
|------|------|
| `afs list [path]` (别名: `ls`) | 列出目录内容 |
| `afs read <path>` | 读取文件内容 |
| `afs write <path> [--content]` | 写入文件 (--content 或 stdin) |
| `afs stat <path>` | 获取文件/目录元信息 |
| `afs search <path> <query>` | 搜索文件内容 |
| `afs exec <path> <action>` | 执行操作 |

### 挂载管理

| 命令 | 功能 |
|------|------|
| `afs mount list` (别名: `ls`) | 列出挂载配置 |
| `afs mount add <path> <uri>` | 添加挂载 |
| `afs mount remove <path>` (别名: `rm`) | 移除挂载 |
| `afs mount validate` | 验证挂载配置 |

### 其他命令

| 命令 | 功能 |
|------|------|
| `afs explain [topic]` | 解释概念 (命令或路径) |
| `afs serve` | 启动 HTTP 服务器 |

## 支持的 URI 方案

| 方案 | 示例 | 说明 |
|------|------|------|
| `fs://` | `fs:///path/to/dir` | 本地文件系统 |
| `git://` | `git:///path/to/repo?branch=main` | Git 仓库 |
| `sqlite://` | `sqlite:///path/to/db.sqlite` | SQLite 数据库 |
| `json://` | `json:///path/to/config.json` | JSON/YAML 文件 |
| `http://` | `http://localhost:3000/afs` | HTTP 远程 AFS |
| `https://` | `https://api.example.com/afs` | HTTPS 远程 AFS |

## HTTP 服务器

### 启动服务器

```bash
# 使用配置文件中的设置启动
afs serve

# 自定义主机和端口
afs serve --host 0.0.0.0 --port 8080

# 只读模式（禁用写入操作）
afs serve --readonly

# 启用 CORS 支持
afs serve --cors

# 自定义基础路径
afs serve --path /api/afs
```

### 服务器选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--host` | localhost | 监听主机地址 |
| `--port` | 3000 | 监听端口 |
| `--path` | /afs | 服务路径前缀 |
| `--readonly` | false | 只读模式 |
| `--cors` | false | 启用 CORS |
| `--maxBodySize` | 10MB | 最大请求体大小 |

### 配置优先级

`命令行参数 > config.toml > 默认值`

### 挂载远程服务器

```bash
# 添加远程 HTTP 挂载
afs mount add /remote http://localhost:3000/afs

# 添加 HTTPS 挂载
afs mount add /api https://api.example.com/afs

# 访问远程挂载
afs list /remote
afs read /remote/file.txt
```

## 输出模式

```bash
# 默认: Machine Truth (LLM/脚本友好)
afs list /src
# 输出: 每行一个路径

# JSON 结构化输出
afs list /src --json

# LLM 优化输出 (token 高效)
afs list /src --view=llm

# 人类友好输出 (树形结构)
afs list /src --view=human
```

### 输出模式对比

| 模式 | 特点 | 适用场景 |
|------|------|----------|
| default | 每行一个路径，pipe-safe | 脚本、grep、awk |
| json | 结构化 JSON | 程序解析 |
| llm | 语义事实，token 高效 | LLM/Agent |
| human | 树形结构，带图标 | 人类阅读 |

## explain 命令

explain 是 AFS CLI 的一等公民，专为 LLM/Agent 设计：

```bash
# 解释命令行为
afs explain afs ls

# 解释 AFS 对象
afs explain /src/index.ts

# JSON 输出 (供 agent 缓存)
afs explain --json afs read
```

**explain vs help**:
- `help`: 解决"我怎么用" - 面向人类
- `explain`: 解决"它到底做了什么" - 面向 LLM/Agent，输出稳定可解析

## 退出码

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | 一般错误 |
| 2 | 参数错误 |
| 3 | 资源未找到 |
| 4 | 权限拒绝 |
| 5 | 运行时错误 |

## 使用场景

### 本地开发

```bash
# 配置项目挂载
afs mount add /src fs://$(pwd)/src
afs mount add /docs fs://$(pwd)/docs

# 启动开发服务器供团队访问
afs serve --host 0.0.0.0 --port 3000
```

### CI/CD 测试

```bash
# 启动测试数据服务器
afs serve --readonly --port 8080 &

# 测试用例访问
curl http://localhost:8080/afs/rpc \
  -d '{"method":"read","params":{"path":"/test-fixtures/data.json"}}'
```

### 临时文件共享

```bash
# 快速共享当前目录
afs mount add /share fs://$(pwd)
afs serve --host 0.0.0.0

# 其他人访问
afs mount add /remote-share http://your-ip:3000/afs
afs list /remote-share
```

### 使用配置文件

```bash
# 创建配置
cat > .afs-config/config.toml << 'EOF'
[[mounts]]
path = "/data"
uri = "fs:///var/data"

[serve]
host = "0.0.0.0"
port = 8080
readonly = true
cors = true
EOF

# 直接启动，无需参数
afs serve
```
