import json
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

PROJECTS_DATA_PATH = Path(__file__).parent / "data" / "projects.json"

class ProjectVectorDB:
    def __init__(self, data_path: Path = PROJECTS_DATA_PATH):
        self.data_path = data_path
        self.load_database()

    def load_database(self):
        with open(self.data_path, encoding="utf-8") as f:
            self.projects = json.load(f)
        
        # Prepare text representation for each project
        self.corpus = [
            f"{p['name']} {p['description']} {' '.join(p['technologies'])}"
            for p in self.projects
        ]
        
        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=500
        )
        self.tfidf_matrix = self.vectorizer.fit_transform(self.corpus)

    def search(self, query_title: str, query_description: str) -> tuple[dict, float]:
        """
        Query the Vector DB for the most similar historical project.
        Returns a tuple of (project_dict, similarity_score).
        """
        query_text = f"{query_title} {query_description}"
        query_vector = self.vectorizer.transform([query_text])
        
        similarities = cosine_similarity(query_vector, self.tfidf_matrix)[0]
        
        # Find the index of the most similar project
        best_idx = int(similarities.argmax())
        best_similarity = float(similarities[best_idx])
        
        return self.projects[best_idx], round(best_similarity, 3)
