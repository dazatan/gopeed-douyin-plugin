/**
 * 抖音视频解析下载插件
 * 使用第三方解析API获取无水印视频链接
 */

export default async function (ctx) {
  const { req, settings } = ctx;
  const videoUrl = req.url;

  try {
    console.log('开始解析抖音视频链接:', videoUrl);

    // 1. 调用解析函数获取视频信息
    const videoInfo = await fetchDouyinVideoInfo(videoUrl, settings?.apiEndpoint);
    
    if (!videoInfo.downloadUrl) {
      throw new Error('未能获取到视频下载链接');
    }

    // 2. 构建返回给Gopeed的结果
    const result = {
      name: videoInfo.title || `抖音视频_${Date.now()}`,
      files: [
        {
          name: sanitizeFilename(videoInfo.filename),
          size: videoInfo.size || 0,
          req: {
            url: videoInfo.downloadUrl,
            headers: {
              // 设置必要的请求头，模拟真实浏览器环境
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1',
              'Referer': 'https://www.douyin.com/',
              'Accept': '*/*',
            },
          },
        },
      ],
      extra: {
        cover: videoInfo.cover, // 视频封面
        author: videoInfo.author, // 作者信息
        duration: videoInfo.duration, // 视频时长
      },
    };

    console.log('视频解析成功:', result.name);
    return result;

  } catch (error) {
    console.error('解析抖音视频失败:', error);
    throw new Error(`抖音视频解析失败: ${error.message}`);
  }
}

/**
 * 调用解析API获取视频信息
 */
async function fetchDouyinVideoInfo(url, apiEndpoint = "https://api.douyin.wtf") {
  // 构造API请求URL
  const apiUrl = `${apiEndpoint}/api?url=${encodeURIComponent(url)}`;
  
  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  // 根据不同API的响应结构进行调整
  // 这里假设API返回的JSON中包含 nwm_video_url 字段为无水印链接
  if (data && data.nwm_video_url) {
    return {
      title: data.desc || `抖音视频_${Date.now()}`,
      downloadUrl: data.nwm_video_url,
      cover: data.cover_url,
      author: data.author?.nickname || "",
      duration: data.duration,
      filename: `douyin_${Date.now()}.mp4`,
    };
  } else {
    throw new Error('API返回的数据结构异常，未找到视频链接');
  }
}

/**
 * 清理文件名中的非法字符
 */
function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*]/g, '_');
}
