const CONFIG = {
  // 已填入你的 Webhook 地址
  WECOM_WEBHOOK: "",
  
  // 面板地址 (请确认是否需要修改)
  PANEL_URL: "",
  
  EVENT_MAP: {
    'Offline': { cn: '离线警报', icon: '🔴', color: 'warning' },
    'Online':  { cn: '恢复上线', icon: '🟢', color: 'info' },
    'Alert':   { cn: '系统告警', icon: '⚠️', color: 'warning' },
    'Renew':   { cn: '续费通知', icon: '💸', color: 'comment' },
    'Expire':  { cn: '到期提醒', icon: '⏳', color: 'warning' },
    'Test':    { cn: '测试消息', icon: '🧪', color: 'info' }
  }
};

async function sendMessage(markdownContent) {
  if (!CONFIG.WECOM_WEBHOOK) return false;

  const url = CONFIG.WECOM_WEBHOOK;
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: {
        content: markdownContent
      }
    }),
  });
  return resp.ok;
}

async function sendEvent(event) {
  try {
    const getCSTTime = (timeStr) => {
      if (!timeStr || timeStr.startsWith('0001')) return "未知时间";
      const date = new Date(timeStr.replace(/\.\d+Z$/, 'Z')); 
      const cst = new Date(date.getTime() + 8 * 60 * 60 * 1000);
      const f = (n) => n.toString().padStart(2, '0');
      return `${f(cst.getUTCMonth() + 1)}-${f(cst.getUTCDate())} ${f(cst.getUTCHours())}:${f(cst.getUTCMinutes())}:${f(cst.getUTCSeconds())}`;
    };

    const formatSpec = (bytes) => {
      if (!bytes || bytes === 0) return '?';
      const k = 1024;
      const gb = bytes / (k * k * k);
      if (gb < 1) {
        return (bytes / (k * k)).toFixed(2) + 'M';
      }
      return gb.toFixed(2) + 'G';
    };

    const ev = CONFIG.EVENT_MAP[event.event] || { cn: event.event, icon: 'ℹ️', color: 'comment' };
    const titleText = `${ev.icon} ${ev.cn}`;
    const header = `## <font color="${ev.color}">${titleText}</font>`;

    let detailsParts = [];
    let targetInstanceId = null;

    // 尝试获取具体的服务器对象
    const c = event.server || (event.clients && event.clients[0]);

    if (c) {
      // === 情况1：单台机器通知（如上下线） ===
      targetInstanceId = c.uuid || c.id;
      const name = c.name; 
      const region = c.region ? `(${c.region.toUpperCase()})` : '';
      
      detailsParts.push(`💻 **${name}** <font color="comment">${region}</font>`);

      const cpu = c.cpu_cores ? parseFloat(c.cpu_cores).toFixed(2) + 'C' : '?';
      const mem = formatSpec(c.mem_total);
      const disk = formatSpec(c.disk_total);
      
      if (cpu !== '?' || mem !== '?') {
          detailsParts.push(`⚙️ <font color="comment">[ ${cpu} | ${mem} | ${disk} ]</font>`);
      }

      if (['Renew', 'Expire'].includes(event.event)) {
         const price = c.price || 0;
         if (price > 0) {
            detailsParts.push(`💰 账单: ${c.currency||'$'}${price} / ${c.billing_cycle||0}天`);
         } else {
             detailsParts.push(`💰 周期: ${c.billing_cycle||0}天`);
         }
      }

    } else {
      // === 情况2：批量通知或无具体机器信息（如到期清单） ===
      if (event.message && event.message.trim()) {
        // 如果有附带信息，把附带信息直接当作通知列表显示，不显示“未知设备”
        detailsParts.push(`📝 **通知列表:**\n${event.message}`);
        // 将 message 清空，防止下方重复添加“备注”
        event.message = null; 
      } else {
        // 既没有服务器对象也没有文字消息，才迫不得已显示未知设备
        detailsParts.push(`💻 **设备:** 未知设备`);
      }
    }

    // 追加单独的备注信息（如果在上面已经被当作通知列表用了，这里就不会执行）
    if (event.message && event.message.trim()) {
      detailsParts.push(`📝 备注: ${event.message}`);
    }

    let links = `[📊 进入面板](${CONFIG.PANEL_URL})`;
    if (targetInstanceId && targetInstanceId !== '未知') {
        links += `  |  [🔗 实例详情](${CONFIG.PANEL_URL}/server/${targetInstanceId})`;
    }

    const body = detailsParts.join('\n\n') + 
                 `\n\n⏰ 时间: <font color="comment">${getCSTTime(event.time)}</font>` +
                 `\n\n${links}`;

    return await sendMessage(`${header}\n${body}`);

  } catch (error) {
    return await sendMessage(`## ❌ 系统错误\n脚本执行出错:\n\`${error.message}\``);
  }
}
