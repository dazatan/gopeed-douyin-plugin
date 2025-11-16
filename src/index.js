/**
 * 抖音视频下载插件 - 增强版
 * 支持多种链接格式和内容类型识别
 */

export default async function (ctx) {
  const { req, settings } = ctx;
  const videoUrl = req.url;
  const timeout = settings?.timeout || 30000;
  const downloadType = settings?.downloadType || 'video';

  try {
    console.log('开始解析抖音链接:', videoUrl);
    
    // 识别链接类型并解析
    const linkType = identifyLinkType(videoUrl);
    console.log('识别链接类型:', linkType);
    
    const finalUrl = await resolveRedirect(videoUrl, timeout);
    console.log('最终URL:', finalUrl);
    
    // 根据链接类型采用不同的解析策略
    let parseResult;
    switch (linkType) {
      case 'short':
      case 'video':
        parseResult = await parseVideoLink(finalUrl, timeout);
        break;
      case 'note':
        parseResult = await parseNoteLink(finalUrl, timeout);
        break;
      case 'user':
        parseResult = await parseUserLink(finalUrl, timeout);
        break;
      default:
        parseResult = await parseVideoLink(finalUrl, timeout);
    }
    
    if (!parseResult) {
      throw new Error('无法解析该链接');
    }

    // 根据用户设置构建下载文件列表
    const files = buildDownloadFiles(parseResult, downloadType);
    
    const result = {
      name: parseResult.title || `抖音内容_${Date.now()}`,
      files: files,
      extra: {
        cover: parseResult.cover,
        author: parseResult.author,
        duration: parseResult.duration,
        platform: 'douyin',
        type: parseResult.type || 'video'
      },
    };

    console.log('解析成功:', result.name, '文件数量:', files.length);
    return result;

  } catch (error) {
    console.error('解析失败:', error);
    throw new Error(`抖音解析失败: ${error.message}`);
  }
}

/**
 * 识别链接类型
 */
function identifyLinkType(url) {
  const patterns = {
    'short': /v\.douyin\.com\/\w+/,
    'video': /douyin\.com\/video\/\w+/,
    'note': /douyin\.com\/note\/\w+/,
    'user': /douyin\.com\/user\/[\w-]+/,
    'discover': /douyin\.com\/discover/,
    'share': /douyin\.com\/share\/\w+/,
    'ies': /iesdouyin\.com/
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(url)) {
      return type;
    }
  }
  
  return 'unknown';
}

/**
 * 解析短链接获取最终URL
 */
async function resolveRedirect(url, timeout) {
  if (!url.includes('v.douyin.com')) {
    return url;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
      }
    });
    
    clearTimeout(timeoutId);
    return response.url;
  } catch (error) {
    console.warn('短链接解析失败，使用原URL:', error);
    return url;
  }
}

/**
 * 解析视频链接
 */
async function parseVideoLink(url, timeout) {
  const videoInfo = await parseWithFallback(url, timeout);
  if (videoInfo) {
    videoInfo.type = 'video';
  }
  return videoInfo;
}

/**
 * 解析笔记链接（图文内容）
 */
async function parseNoteLink(url, timeout) {
  // 抖音笔记可能是图文内容，需要特殊处理
  const noteInfo = await parseWithFallback(url, timeout);
  if (noteInfo) {
    noteInfo.type = 'note';
    // 如果是图文笔记，可能有多个图片文件
    if (noteInfo.images && Array.isArray(noteInfo.images)) {
      noteInfo.multipleFiles = true;
    }
  }
  return noteInfo;
}

/**
 * 解析用户主页链接
 */
async function parseUserLink(url, timeout) {
  // 用户主页可能需要特殊处理，或者提示用户提供具体视频链接
  throw new Error('用户主页链接暂不支持批量下载，请提供具体视频链接');
}

/**
 * 构建下载文件列表
 */
function buildDownloadFiles(parseResult, downloadType) {
  const files = [];
  
  // 添加视频文件
  if ((downloadType === 'video' || downloadType === 'both') && parseResult.downloadUrl) {
    files.push({
      name: sanitizeFilename(parseResult.filename || `douyin_video_${Date.now()}.mp4`),
      size: parseResult.size || 0,
      req: {
        url: parseResult.downloadUrl,
        headers: getVideoHeaders(),
      },
    });
  }
  
  // 添加封面图片
  if ((downloadType === 'cover' || downloadType === 'both') && parseResult.cover) {
    files.push({
      name: sanitizeFilename(`cover_${Date.now()}.jpg`),
      size: 0,
      req: {
        url: parseResult.cover,
        headers: getImageHeaders(),
      },
    });
  }
  
  // 添加多个图片文件（针对图文笔记）
  if (parseResult.multipleFiles && parseResult.images) {
    parseResult.images.forEach((imageUrl, index) => {
      files.push({
        name: sanitizeFilename(`image_${index + 1}_${Date.now()}.jpg`),
        size: 0,
        req: {
          url: imageUrl,
          headers: getImageHeaders(),
        },
      });
    });
  }
  
  return files;
}

/**
 * 获取视频请求头
 */
function getVideoHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    'Referer': 'https://www.douyin.com/',
    'Accept': 'video/mp4,video/webm,video/*;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Range': 'bytes=0-',
  };
}

/**
 * 获取图片请求头
 */
function getImageHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    'Referer': 'https://www.douyin.com/',
    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
  };
}

/**
 * 使用多个备用解析源
 */
async function parseWithFallback(url, timeout) {
  const parsers = [
    parseWithDouyinWTF,    // 主要解析源
    parseWithJiexiTop,     // 备用解析源1
    parseWithTenAPI        // 备用解析源2
  ];

  for (const parser of parsers) {
    try {
      const result = await parser(url, timeout);
      if (result && (result.downloadUrl || result.images)) {
        console.log(`使用解析源成功: ${parser.name}`);
        return result;
      }
    } catch (error) {
      console.warn(`解析源 ${parser.name} 失败:`, error.message);
      continue;
    }
  }
  
  throw new Error('所有解析源都失败了');
}

/**
 * 解析源1: douyin.wtf API
 */
async function parseWithDouyinWTF(url, timeout) {
  const apiUrl = `https://api.douyin.wtf/api?url=${encodeURIComponent(url)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`douyin.wtf API HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // 处理视频内容
    if (data.nwm_video_url) {
      return {
        title: data.desc || '抖音视频',
        downloadUrl: data.nwm_video_url,
        cover: data.cover_url,
        author: data.author?.nickname || data.nickname || '',
        duration: data.duration || 0,
        filename: `douyin_${Date.now()}.mp4`
      };
    }
    
    // 处理图文内容（如果有图片列表）
    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
      return {
        title: data.desc || '抖音图文',
        images: data.images,
        author: data.author?.nickname || data.nickname || '',
        filename: `douyin_note_${Date.now()}`
      };
    }
    
    throw new Error('douyin.wtf返回数据格式异常');
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 解析源2: jiexi.top API
 */
async function parseWithJiexiTop(url, timeout) {
  const apiUrl = `https://api.jiexi.top/?url=${encodeURIComponent(url)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`jiexi.top API HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // 适配不同API返回格式
    if (data.url || data.videoUrl) {
      return {
        title: data.title || data.desc || '抖音视频',
        downloadUrl: data.url || data.videoUrl,
        cover: data.cover || data.coverUrl,
        author: data.author || data.nickname || '',
        duration: data.duration || 0,
        filename: `douyin_${Date.now()}.mp4`
      };
    }
    
    throw new Error('jiexi.top返回数据格式异常');
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 解析源3: tenapi.cn
 */
async function parseWithTenAPI(url, timeout) {
  const apiUrl = `https://tenapi.cn/douyin/?url=${encodeURIComponent(url)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`tenapi.cn API HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.code === 200 && data.url) {
      return {
        title: data.title || '抖音视频',
        downloadUrl: data.url,
        cover: data.cover || '',
        author: data.author || '',
        duration: 0,
        filename: `douyin_${Date.now()}.mp4`
      };
    }
    
    throw new Error('tenapi.cn返回数据格式异常');
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 清理文件名
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}
