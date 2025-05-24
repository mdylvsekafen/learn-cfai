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


      if (model === '@cf/black-forest-labs/flux-1-schnell') {
        // flux-1-schnell模型返回的是base64编码，其他模型返回的都是二进制的png文件
        // 如果模型是 flux-1-schnell，处理 base64 图片数据
        if (response.image) {
          const base64Image = response.image;
          const blob = await base64ToBlob(base64Image);

          if (upload) {
            const uploadResponse = await uploadToImageHost(blob);
            if (uploadResponse?.src) {
              // 返回图床的图片地址
              return new Response(JSON.stringify({
                imageUrl: `https://pic.foxhank.top${uploadResponse.src}`
              }), {
                status: 200,
                headers: {
                  ...corsHeaders,
                  'content-type': 'application/json'
                }
              });
            } else {
              return new Response(JSON.stringify({
                errors: ['Image upload failed'],
                messages: []
              }), {
                status: 500,
                headers: {
                  ...corsHeaders,
                  'content-type': 'application/json'
                }
              });
            }
          } else {
            // 不上传，直接返回原始图片
            return new Response(blob, {
              headers: {
                ...corsHeaders,
                'content-type': 'image/png'
              }
            });
          }
        } else {
          return new Response(JSON.stringify({
            errors: ['No image found in the response'],
            messages: []
          }), {
            status: 500,
            headers: {
              ...corsHeaders,
              'content-type': 'application/json'
            }
          });
        }
      } else {
        //处理其他模型
        if (upload) {
          //把返回的stream转化为blob
          async function convertReadableStreamToBlob(readableStream: BodyInit | null | undefined) {
            try {
              // 将 ReadableStream 转换为 Blob
              const response = new Response(readableStream);
              const blob = await response.blob();
              return blob;
            } catch (error) {
              console.error('转换 ReadableStream 出错:', error);
              return null;
            }
          }
          // 转换 ReadableStream 为 Blob
          const blob = await convertReadableStreamToBlob(response);

          const uploadResponse = await uploadToImageHost(blob);
          if (uploadResponse?.src) {
            return new Response(JSON.stringify({
              imageUrl: `https://pic.foxhank.top${uploadResponse.src}`
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                'content-type': 'application/json'
              }
            });
          } else {
            return new Response(JSON.stringify({
              errors: ['Image upload failed'],
              messages: [uploadResponse.text]
            }), {
              status: 500,
              headers: {
                ...corsHeaders,
                'content-type': 'application/json'
              }
            });
          }
        } else {
          // 如果不上传，直接返回原始图片
          return new Response(response, {
            headers: {
              ...corsHeaders,
              'content-type': 'image/png;base64',
            },
          });
        }
      }
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

// 上传图片到图床
async function uploadToImageHost(blob: Blob) {
  const formData = new FormData();
  formData.append('file', blob, 'image.png');

  try {
    const response = await fetch('https://pic.foxhank.top/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorMessage = await response.text(); // 等待并获取错误信息
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorMessage}`);
    }

    const jsonResponse = await response.json();
    return jsonResponse[0]; // 图床返回地址里面是 src 字段
  } catch (error) {
    console.error(error); // 记录错误信息
    return null;
  }
}
