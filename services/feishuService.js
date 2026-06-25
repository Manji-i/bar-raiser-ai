import crypto from 'crypto';

/**
 * 飞书OAuth2认证服务
 * 文档：https://open.feishu.cn/document/server-docs/authentication-management/obtain-user-info
 */

// 飞书配置
const getFeishuConfig = () => ({
  clientId: process.env.FEISHU_APP_ID || '',
  clientSecret: process.env.FEISHU_APP_SECRET || '',
  redirectUri: process.env.FEISHU_REDIRECT_URI || '',
  appTicket: process.env.FEISHU_APP_TICKET || '',
});

// 生成随机state，防止CSRF攻击
const generateState = () => {
  return crypto.randomBytes(16).toString('hex');
};

// 生成飞书登录URL
const getFeishuAuthUrl = (state) => {
  const config = getFeishuConfig();
  const params = new URLSearchParams({
    app_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state,
  });
  return `https://open.feishu.cn/open-apis/authen/v1/index?${params.toString()}`;
};

// 获取app_access_token
const getAppAccessToken = async () => {
  const config = getFeishuConfig();
  
  try {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: config.clientId,
        app_secret: config.clientSecret,
      }),
    });

    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`获取app_access_token失败: ${data.msg}`);
    }

    return data.app_access_token;
  } catch (error) {
    console.error('获取app_access_token错误:', error);
    throw error;
  }
};

// 使用code换取飞书用户access_token
const getFeishuToken = async (code) => {
  const config = getFeishuConfig();
  
  try {
    // 先获取app_access_token
    const appAccessToken = await getAppAccessToken();
    
    const response = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appAccessToken}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    });

    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`获取飞书token失败: ${data.msg}`);
    }

    return {
      accessToken: data.data?.access_token || data.access_token,
      refreshToken: data.data?.refresh_token || data.refresh_token,
      expiresIn: data.data?.expires_in || data.expires_in,
    };
  } catch (error) {
    console.error('获取飞书token错误:', error);
    throw error;
  }
};

// 获取飞书用户信息
const getFeishuUserInfo = async (accessToken) => {
  try {
    const response = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(`获取飞书用户信息失败: ${data.msg}`);
    }

    const userData = data.data || data;
    return {
      userId: userData.open_id || userData.user_id,
      name: userData.name,
      email: userData.email,
      avatar: userData.avatar_url || userData.avatar,
    };
  } catch (error) {
    console.error('获取飞书用户信息错误:', error);
    throw error;
  }
};

// 检查飞书配置是否有效
const isFeishuConfigured = () => {
  const config = getFeishuConfig();
  return Boolean(config.clientId && config.clientSecret && config.redirectUri);
};

export default {
  getFeishuAuthUrl,
  generateState,
  getFeishuToken,
  getFeishuUserInfo,
  isFeishuConfigured,
  getFeishuConfig,
};
