import HTML from './index.html';

export default {
  async fetch(request: { headers: { get: (arg0: string) => any; }; method: string; json: () => any; }, env: { AI: { run: (arg0: string, arg1: { prompt: any; }) => any; }; }) {
    const originalHost = request.headers.get("host");

    // 设置CORS头部
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', // 允许任何源
      'Access-Control-Allow-Methods': 'GET, POST', // 允许的请求方法
      'Access-Control-Allow-Headers': 'Content-Type' // 允许的请求头
    };

    // 如果这是一个预检请求，则直接返回CORS头部
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // 检查请求方法
    if (request.method === 'POST') {
      // 处理 POST 请求，用于 AI 绘画功能
      const data = await request.json();
      const upload = data.upload ?? false;  // 由后端直接上传到图床，解决奇奇怪怪的网络问题

      let model = '@cf/stabilityai/stable-diffusion-xl-base-1.0'; // 默认模型

      // 检查 prompt 是否存在
      if (!('prompt' in data) || data.prompt.trim() === '') {
        return new Response('Missing prompt', { status: 400, headers: corsHeaders });
      }

      // 检查 model 是否存在，如果没有则使用默认模型
      if ('model' in data) {
        switch (data.model) {
          case 'stable-diffusion-xl-base-1.0':
            model = '@cf/stabilityai/stable-diffusion-xl-base-1.0';
            break;
          case 'stable-diffusion-xl-lightning':
            model = '@cf/bytedance/stable-diffusion-xl-lightning';
            break;
          case 'stable-diffusion-v1-5-inpainting':
            model = '@cf/runwayml/stable-diffusion-v1-5-inpainting';
            break;
          default:
            break;
        }
      }

      let inputs = {
        prompt: data.prompt.trim()
      };

      // 如果模型不是 flux-1-schnell, 则添加 width 和 height
      if (model !== '@cf/black-forest-labs/flux-1-schnell') {
        inputs.width = data.resolution?.width ?? 1024;
        inputs.height = data.resolution?.height ?? 1024;
      } else {
        // 反之添加 num_steps
        inputs.num_steps = 8; // 默认值
      }

      const response = await env.AI.run(model, inputs);

      // 直接返回原始图片
      return new Response(response, {
        headers: {
          ...corsHeaders,
          'content-type': 'image/png;base64',
        },
      });

    } else {
      // 处理 GET 请求，返回 index.html
      return new Response(HTML.replace(/{{host}}/g, originalHost), {
        status: 200,
        headers: {
          ...corsHeaders, // 合并CORS头部
          "content-type": "text/html"
        }
      });
    }
  }
};

// 将 Base64 图片数据转换为 Blob
async function base64ToBlob(base64: string) {
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  const byteString = atob(base64Data);
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }
  return new Blob([uint8Array], { type: 'image/png' });
}

