from flask import Flask, request, jsonify
from gensim.models.keyedvectors import KeyedVectors

app = Flask(__name__)

# モデルのロード
# https://www.cl.ecei.tohoku.ac.jp/~m-suzuki/jawiki_vector/data/20170201.tar.bz2

model = KeyedVectors.load_word2vec_format('./entity_vector.model.bin', binary=True)

@app.route('/similar', methods=['POST'])
def get_similar_words():
    data = request.json
    word = data.get('word')
    if not word:
        return jsonify({'error': 'No word provided'}), 400
    
    try:
        similar_words = model.most_similar(word)
        return jsonify({'word': word, 'similar_words': similar_words})
    except KeyError:
        return jsonify({'error': f'Word "{word}" not in vocabulary'}), 400

@app.route('/calculate', methods=['POST'])
def calculate_vector():
    data = request.json
    positive = data.get('positive', [])
    negative = data.get('negative', [])
    if not positive:
        return jsonify({'error': 'No positive words provided'}), 400
    
    try:
        result = model.most_similar(positive=positive, negative=negative)
        return jsonify({'result': result})
    except KeyError as e:
        return jsonify({'error': f'Word "{str(e)}" not in vocabulary'}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

