<div align="center">
</div>

# Bar Raiser AI - Interview Analysis Tool

This application helps analyze interview transcripts using the STAR method to generate professional hiring recommendations based on person-job fit. It uses Google Gemini AI or Doubao (Volcengine) for analysis.

## Features

- **Upload Transcripts**: Supports PDF, Word (.docx), and Text (.txt) files.
- **Job Fit Analysis**: Evaluates candidates based on specific job titles and competency models.
- **Multi-Model Support**: Supports Google Gemini and Volcengine Doubao.
- **Secure Backend**: API keys are stored securely on the server and not exposed to the client.
- **Export Reports**: Download analysis results as Markdown or PDF.

## Prerequisites

- Node.js (v18 or higher recommended)
- Google Gemini API Key or Volcengine Doubao API Key & Endpoint ID

## Setup & Run Locally

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Create a `.env.local` file in the root directory and add your API keys:
   ```env
   # Choose your AI Provider: 'gemini' or 'doubao'
   AI_PROVIDER=doubao

   # Google Gemini Configuration
   GEMINI_API_KEY=your_gemini_key

   # Doubao (Volcengine) Configuration
   DOUBAO_API_KEY=your_doubao_key
   DOUBAO_ENDPOINT_ID=your_endpoint_id
   DOUBAO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
   
   ```

3. **Development Mode**
   Run the frontend (Vite) and backend (Express) concurrently with hot-reloading:
   ```bash
   npm run dev

## Production Build & Deployment

### Standard Deployment (Node.js)

1. **Build the Frontend**
   ```bash
   npm run build
   ```
   This compiles the React application into the `dist` folder.

2. **Start the Server**
   ```bash
   npm start
   ```
   This starts the Node.js server which serves the static files from `dist` and handles API requests.

### Docker Deployment (Recommended for Volcengine)

1. **Build the Docker Image**
   ```bash
   docker build -t bar-raiser-ai .
   ```

2. **Run the Container**
   ```bash
   docker run -p \
     -e AI_PROVIDER=doubao \
     -e DOUBAO_API_KEY=your_key \
     -e DOUBAO_ENDPOINT_ID=your_id \
     bar-raiser-ai
   ```

### Deploy to Volcengine (火山引擎)

1. **Push Image to CR (Container Registry)**:
   - Create a repository in Volcengine CR.
   - Login and push your Docker image.

2. **Deploy to VCI (Vital Container Instance) or VKE**:
   - Create a new VCI instance or VKE workload.
   - Select your image from CR.
   - **Crucial**: Set the Environment Variables (`AI_PROVIDER`, `DOUBAO_API_KEY`, `DOUBAO_ENDPOINT_ID`) in the container configuration.

## Project Structure

- `server.js`: Express backend server handling API requests and serving static files.
- `Dockerfile`: Configuration for building the production container image.
- `src/`: React frontend source code.
- `src/services/geminiService.ts`: Frontend service communicating with the backend API.
- `vite.config.ts`: Vite configuration with API proxy for development.
