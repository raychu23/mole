import json, sys
from sentence_transformers import SentenceTransformer
model = SentenceTransformer("all-MiniLM-L6-v2")
data = json.load(open(sys.argv[1]))
texts = data["texts"]
embs = model.encode(texts, batch_size=32, show_progress_bar=False, normalize_embeddings=False)
json.dump([e.tolist() for e in embs], open(sys.argv[2], "w"))
