import urllib.request
from src.db.query import q

def go():
    return urllib.request.urlopen('/x')

def v():
    return q()
