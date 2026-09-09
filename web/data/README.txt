Este archivo se reemplaza por collection.json (y por una carpeta
images/) cuando corres:

  cd tools
  npm install
  npm run build

Eso genera collection.json aquí mismo, con toda la colección r3tards
ya resuelta (nombre, imagen, rasgos, rareza de cada token), y descarga
cada imagen a images/<tokenId>.<ext> — así el juego no depende de que
el navegador de cada jugador pueda hablar con gateways de IPFS (muchos
no mandan los encabezados CORS que el navegador exige, y por eso las
imágenes se ven en blanco si se cargan en vivo). El juego detecta este
archivo solo y carga instantáneo. Mientras no exista, el juego sigue
funcionando igual, solo que carga la colección y las imágenes leyendo
la cadena/IPFS en vivo (más lento, y con más riesgo de que las
imágenes no se vean).

Normalmente no necesitas correr esto a mano: el flujo automático de
.github/workflows/deploy.yml ya lo hace en cada publicación.

No subas este README.txt junto con collection.json — no hace falta,
es solo una nota para ti.
