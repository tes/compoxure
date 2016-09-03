
FROM mhart/alpine-node
WORKDIR /app
EXPOSE 5000
EXPOSE 5001
ADD package.json package.json
RUN \ 
npm install --silent --progress=false && \
rm -rf /root/.npm /root/.node-gyp
